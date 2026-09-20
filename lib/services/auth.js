import 'server-only';

import crypto from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { nowIso, randomId, withTransaction } from '../db/index.js';
import { getCreditWallet, grantPerpetualCredits } from '../financial/creditService.js';
import * as authRepo from '../repositories/auth.js';
import * as userRepo from '../repositories/users.js';

const INITIAL_SIGNUP_CREDITS = Number(process.env.INITIAL_SIGNUP_CREDITS || 10);

export function json(data, init = {}) {
  return NextResponse.json(data, init);
}

export function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function validateCredentials(email, password) {
  const normalized = normalizeEmail(email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) return '请输入有效的邮箱地址';
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) return '密码长度需为 8–200 个字符';
  return null;
}

function newUserId() { return randomId('usr'); }
function newAccountId(prefix) { return randomId(`acc_${prefix}`); }

export async function generateUniqueUserNumber(tx = null) {
  for (let i = 0; i < 30; i++) {
    const num = String(Math.floor(100000 + Math.random() * 900000));
    const exists = await authRepo.checkUserNumberExists(num, tx);
    if (!exists) return num;
  }
  return String(Date.now()).slice(-6);
}

function defaultDisplayName({ email, phone, provider, userNumber }) {
  if (userNumber) return `创作者#${userNumber}`;
  if (email) return email.split('@')[0];
  if (phone) return `用户${phone.slice(-4)}`;
  return `${provider}_user`;
}

export async function findOrCreateUserByPhone({ phone, countryCode = '+86', registrationSource = 'web', ip = null }) {
  const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').trim();
  const fullPhone = cleanPhone.startsWith('+') ? cleanPhone : `${countryCode}${cleanPhone}`;
  const now = nowIso();
  return withTransaction(async (tx) => {
    const boundAccount = await authRepo.findPhoneAccount(fullPhone, tx);
    if (boundAccount) {
      const user = await authRepo.findUserForUpdate(boundAccount.user_id, tx);
      if (!user) return { error: 'USER_NOT_FOUND', message: '关联用户档案不存在' };
      if (user.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，请联系客服' };
      await authRepo.updateLoginMetadata({ userId: user.id, provider: 'phone', providerUserId: fullPhone, timestamp: now, ip }, tx);
      return { user: { ...user, last_login_at: now, last_login_ip: ip }, isNew: false };
    }

    const existingUser = await authRepo.findUserByPhoneForUpdate(cleanPhone, tx);
    if (existingUser) {
      await authRepo.insertPhoneAccount({ id: newAccountId('ph'), userId: existingUser.id, providerUserId: fullPhone, timestamp: now, ignoreConflict: true }, tx);
      await authRepo.updateLoginMetadata({ userId: existingUser.id, timestamp: now, ip }, tx);
      return { user: { ...existingUser, last_login_at: now, last_login_ip: ip }, isNew: false };
    }

    const userId = newUserId();
    const userNumber = await generateUniqueUserNumber(tx);
    const user = await authRepo.insertUser({
      id: userId,
      userNumber,
      phone: cleanPhone,
      phoneCountryCode: countryCode,
      displayName: `用户#${userNumber}`,
      registrationSource,
      lastLoginAt: now,
      lastLoginIp: ip,
      createdAt: now,
      updatedAt: now
    }, tx);
    await authRepo.insertPhoneAccount({ id: newAccountId('ph'), userId, providerUserId: fullPhone, timestamp: now }, tx);
    if (INITIAL_SIGNUP_CREDITS > 0) await grantPerpetualCredits(userId, INITIAL_SIGNUP_CREDITS, '新用户手机注册体验额度', userId, `signup:phone:${userId}`, tx);
    await authRepo.addNewUserTag(userId, now, tx);
    return { user, isNew: true };
  });
}

export async function createUser(email, password, { registrationSource = 'web', ip = null } = {}) {
  const normalized = normalizeEmail(email);
  const now = nowIso();
  const { salt, hash } = passwordHash(password);
  const userId = newUserId();
  return withTransaction(async (tx) => {
    const existingAcc = await authRepo.findEmailAccountForUpdate(normalized, tx);
    const existingUser = await authRepo.findUserByEmailForUpdate(normalized, tx);
    if (existingAcc || existingUser) return { error: '该邮箱已注册，请直接登录' };
    const userNumber = await generateUniqueUserNumber(tx);
    const user = await authRepo.insertUser({
      id: userId,
      userNumber,
      email: normalized,
      passwordHash: hash,
      passwordSalt: salt,
      displayName: defaultDisplayName({ email: normalized, userNumber }),
      registrationSource,
      lastLoginAt: now,
      lastLoginIp: ip,
      createdAt: now,
      updatedAt: now
    }, tx);
    await authRepo.insertEmailAccount({ id: newAccountId('em'), userId, email: normalized, passwordHash: hash, passwordSalt: salt, timestamp: now }, tx);
    if (INITIAL_SIGNUP_CREDITS > 0) await grantPerpetualCredits(userId, INITIAL_SIGNUP_CREDITS, '新用户邮箱注册体验额度', userId, `signup:email:${userId}`, tx);
    await authRepo.addNewUserTag(userId, now, tx);
    return { user };
  });
}

export async function authenticateUser(identifier, password, ip = null) {
  const clean = String(identifier || '').trim();
  const credential = await authRepo.findCredentialByAccount(clean);
  if (!credential?.password_hash) return null;
  const { hash } = passwordHash(password, credential.password_salt);
  const actual = Buffer.from(hash, 'hex');
  const expected = Buffer.from(credential.password_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
  const user = await authRepo.findUserByIdBasic(credential.user_id);
  if (!user) return null;
  if (user.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，如有疑问请联系客服支持' };
  await authRepo.updateLoginMetadata({ userId: user.id, timestamp: nowIso(), ip });
  return user;
}

export async function createOAuthUser({ provider, providerUserId, email, emailVerified = false, displayName, avatarUrl, profile = null, ip = null }) {
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const trustedEmail = emailVerified === true ? normalizedEmail : null;
  const providerId = String(providerUserId);
  const now = nowIso();
  return withTransaction(async (tx) => {
    const bound = await authRepo.findOAuthAccount(provider, providerId, tx);
    if (bound) {
      const existingUser = await authRepo.findUserForUpdate(bound.user_id, tx);
      if (existingUser) {
        if (existingUser.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，无法登录' };
        if ((!existingUser.email || existingUser.email === '') && trustedEmail) {
          await authRepo.updateUserEmailIfEmpty(existingUser.id, trustedEmail, tx);
          existingUser.email = trustedEmail;
        }
        if (!existingUser.avatar_url && avatarUrl) {
          await authRepo.updateUserAvatarIfEmpty(existingUser.id, avatarUrl, tx);
          existingUser.avatar_url = avatarUrl;
        }
        await authRepo.insertOAuthAccount({
          id: newAccountId(provider.slice(0, 2)),
          userId: existingUser.id,
          provider,
          providerUserId: providerId,
          providerEmail: trustedEmail || normalizedEmail,
          displayName: displayName || existingUser.display_name,
          profile,
          timestamp: now
        }, tx);
        await authRepo.updateLoginMetadata({ userId: existingUser.id, provider, providerUserId: providerId, timestamp: now, ip }, tx);
        await authRepo.recordAuthEvent({ eventType: 'oauth_login', target: existingUser.id, requestIp: ip, metadata: { provider, providerUserId: providerId }, transaction: tx });
        return existingUser;
      }
    }
    const targetUser = trustedEmail ? await authRepo.findUserByEmailForUpdate(trustedEmail, tx) : null;
    if (targetUser) {
      if (targetUser.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，无法登录' };
      const binding = await authRepo.findOAuthBindingForUpdate(provider, providerId, tx);
      if (binding && binding.user_id !== targetUser.id) return { error: 'ACCOUNT_BINDING_CONFLICT', message: '该第三方账号已经绑定到其他用户，无法自动合并' };
      await authRepo.insertOAuthAccount({
        id: newAccountId(provider.slice(0, 2)),
        userId: targetUser.id,
        provider,
        providerUserId: providerId,
        providerEmail: trustedEmail,
        displayName: displayName || targetUser.display_name,
        profile,
        timestamp: now
      }, tx);
      if (!targetUser.avatar_url && avatarUrl) {
        await authRepo.updateUserAvatarIfEmpty(targetUser.id, avatarUrl, tx);
        targetUser.avatar_url = avatarUrl;
      }
      await authRepo.updateLoginMetadata({ userId: targetUser.id, provider, providerUserId: providerId, timestamp: now, ip }, tx);
      await authRepo.recordAuthEvent({ eventType: 'oauth_bind_auto', target: targetUser.id, requestIp: ip, metadata: { provider, providerUserId: providerId, email: trustedEmail }, transaction: tx });
      return targetUser;
    }
    const userId = newUserId();
    const userNumber = await generateUniqueUserNumber(tx);
    const user = await authRepo.insertUser({
      id: userId,
      userNumber,
      email: trustedEmail,
      displayName: displayName || defaultDisplayName({ email: trustedEmail, provider, userNumber }),
      avatarUrl: avatarUrl || null,
      registrationSource: provider,
      lastLoginAt: now,
      lastLoginIp: ip,
      createdAt: now,
      updatedAt: now
    }, tx);
    await authRepo.insertOAuthAccount({
      id: newAccountId(provider.slice(0, 2)),
      userId,
      provider,
      providerUserId: providerId,
      providerEmail: trustedEmail || normalizedEmail,
      displayName,
      profile,
      timestamp: now
    }, tx);
    if (INITIAL_SIGNUP_CREDITS > 0) await grantPerpetualCredits(userId, INITIAL_SIGNUP_CREDITS, `${provider} 快捷登录体验额度`, userId, `signup:${provider}:${userId}`, tx);
    await authRepo.addNewUserTag(userId, now, tx);
    await authRepo.recordAuthEvent({ eventType: 'oauth_signup', target: userId, requestIp: ip, metadata: { provider, providerUserId: providerId, email: trustedEmail }, transaction: tx });
    return user;
  });
}

export async function bindOAuthUser({ userId, provider, providerUserId, email, displayName, avatarUrl, profile = null, ip = null }) {
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const trustedEmail = (provider === 'google' || normalizedEmail) ? normalizedEmail : null;
  const providerId = String(providerUserId);
  const now = nowIso();
  return withTransaction(async (tx) => {
    const user = await authRepo.findUserForUpdate(userId, tx);
    if (!user) return { error: 'USER_NOT_FOUND', message: '当前用户不存在或已失效' };
    if (user.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED', message: '账户已被封禁' };

    const bound = await authRepo.findOAuthAccount(provider, providerId, tx);
    if (bound && bound.user_id !== userId) {
      return { error: 'ACCOUNT_ALREADY_BOUND', message: `该 ${provider} 账号已被其他用户绑定，无法重复绑定` };
    }

    await authRepo.insertOAuthAccount({
      id: newAccountId(provider.slice(0, 2)),
      userId: user.id,
      provider,
      providerUserId: providerId,
      providerEmail: trustedEmail || normalizedEmail,
      displayName: displayName || user.display_name,
      profile,
      timestamp: now
    }, tx);

    if ((!user.email || user.email === '') && trustedEmail) {
      await authRepo.updateUserEmailIfEmpty(user.id, trustedEmail, tx);
      user.email = trustedEmail;
    }

    if (!user.avatar_url && avatarUrl) {
      await authRepo.updateUserAvatarIfEmpty(user.id, avatarUrl, tx);
      user.avatar_url = avatarUrl;
    }

    await authRepo.updateLoginMetadata({ userId: user.id, provider, providerUserId: providerId, timestamp: now, ip }, tx);
    await authRepo.recordAuthEvent({ eventType: 'oauth_bound', target: user.id, requestIp: ip, metadata: { provider, providerUserId: providerId, email: trustedEmail }, transaction: tx });
    return { success: true, user };
  });
}

export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttlDays = Math.max(1, Number(process.env.BILLING_SESSION_TTL_DAYS || 30));
  const expires = new Date(Date.now() + ttlDays * 86400000).toISOString();
  return withTransaction(async (tx) => {
    await authRepo.insertSession({ tokenHash: hashToken(token), userId, expiresAt: expires, timestamp: nowIso() }, tx);
    await authRepo.recordAuthEvent({ eventType: 'session_created', target: userId, transaction: tx });
    return { token, expires };
  });
}

export async function deleteSession(token) {
  if (!token) return;
  return withTransaction(async (tx) => {
    const tokenHash = hashToken(token);
    const existing = await authRepo.findSessionOwnerForUpdate(tokenHash, tx);
    const deleted = await authRepo.deleteSessionByHash(tokenHash, tx);
    if (deleted && existing?.user_id) await authRepo.recordAuthEvent({ eventType: 'session_revoked', target: existing.user_id, transaction: tx });
  });
}

export async function refreshSession(token) {
  if (!token) return null;
  const nextToken = crypto.randomBytes(32).toString('base64url');
  const ttlDays = Math.max(1, Number(process.env.BILLING_SESSION_TTL_DAYS || 30));
  const expires = new Date(Date.now() + ttlDays * 86400000).toISOString();
  const now = nowIso();
  return withTransaction(async (tx) => {
    const current = await authRepo.lockSessionUser(hashToken(token), tx);
    if (!current || current.status === 'suspended' || new Date(current.expires_at).getTime() <= Date.now()) return null;
    await authRepo.rotateSession({ oldTokenHash: hashToken(token), nextTokenHash: hashToken(nextToken), userId: current.user_id, expiresAt: expires, timestamp: now }, tx);
    await authRepo.recordAuthEvent({ eventType: 'session_refreshed', target: current.user_id, transaction: tx });
    return { token: nextToken, expires, userId: current.user_id };
  });
}

export async function getUserBySession(token) {
  if (!token) return null;
  const row = await authRepo.findUserSession(hashToken(token));
  if (!row) return null;
  if (row.status === 'suspended' || new Date(row.expires_at).getTime() <= Date.now()) {
    await deleteSession(token);
    return null;
  }
  const [accounts, tags, creditWallet] = await Promise.all([authRepo.listLoginProviders(row.id), authRepo.listUserTags(row.id), getCreditWallet(row.id)]);
  return {
    id: row.id,
    uuid: row.uuid,
    userNumber: row.user_number || null,
    displayName: row.display_name || (row.phone ? `用户${row.phone.slice(-4)}` : row.email?.split('@')[0]) || (row.user_number ? `创作者#${row.user_number}` : '创作者'),
    avatar: row.avatar_url || null,
    email: row.email || null,
    phone: row.phone || null,
    phoneCountryCode: row.phone_country_code || '+86',
    role: row.role || 'user',
    status: row.status || 'active',
    isActivityPublic: row.is_activity_public !== false,
    privacySettings: row.privacy_settings || { hide_activity: false, hide_stats: false },
    locale: row.locale || 'zh-CN',
    credits: Number(creditWallet?.totalAvailable ?? row.credits ?? 0),
    creditBuckets: creditWallet || null,
    loginProviders: [...new Set(accounts.map((account) => account.provider))],
    authAccounts: accounts.map((a) => ({
      id: a.id,
      provider: a.provider,
      providerUserId: a.provider_user_id,
      providerEmail: a.provider_email || null,
      providerUsername: a.provider_username || null,
      createdAt: a.created_at,
      lastLoginAt: a.last_login_at,
    })),
    tags,
  };
}

export async function unbindUserPhone(userId) {
  return withTransaction(async (tx) => {
    const summary = await authRepo.getUserCredentialSummary(userId, tx);
    if (!summary.hasPhone) return { error: 'ALREADY_UNBOUND', message: '当前未绑定手机号' };
    // 如果没有密码，且只剩这一个手机凭据（无邮箱无OAuth），则不允许解绑
    if (!summary.hasPassword && summary.validCredentialCount <= 1) {
      return {
        error: 'CANNOT_UNBIND_LAST_CREDENTIAL',
        message: '为了保障账号安全，请至少保留一种登录凭据（或先设置登录密码），不可全部解绑。'
      };
    }
    await authRepo.removePhoneAccount(userId, tx);
    await authRepo.recordAuthEvent({ eventType: 'phone_unbound', target: userId, transaction: tx });
    return { success: true, message: '手机号已成功解绑' };
  });
}

export async function unbindUserEmail(userId) {
  return withTransaction(async (tx) => {
    const summary = await authRepo.getUserCredentialSummary(userId, tx);
    if (!summary.hasEmail) return { error: 'ALREADY_UNBOUND', message: '当前未绑定邮箱' };
    if (!summary.hasPassword && summary.validCredentialCount <= 1) {
      return {
        error: 'CANNOT_UNBIND_LAST_CREDENTIAL',
        message: '为了保障账号安全，请至少保留一种登录凭据（或先设置登录密码），不可全部解绑。'
      };
    }
    await authRepo.removeEmailAccount(userId, tx);
    await authRepo.recordAuthEvent({ eventType: 'email_unbound', target: userId, transaction: tx });
    return { success: true, message: '安全邮箱已成功解绑' };
  });
}

export async function unbindUserOAuth(userId, provider) {
  const p = String(provider || '').toLowerCase().trim();
  return withTransaction(async (tx) => {
    const summary = await authRepo.getUserCredentialSummary(userId, tx);
    if (!summary.oauthProviders.includes(p)) {
      return { error: 'ALREADY_UNBOUND', message: `当前未绑定 ${p} 账号` };
    }
    if (!summary.hasPassword && summary.validCredentialCount <= 1) {
      return {
        error: 'CANNOT_UNBIND_LAST_CREDENTIAL',
        message: '为了保障账号安全，请至少保留一种登录凭据（或先设置登录密码），不可全部解绑。'
      };
    }
    await authRepo.removeOAuthAccount(userId, p, tx);
    await authRepo.recordAuthEvent({ eventType: 'oauth_unbound', target: userId, metadata: { provider: p }, transaction: tx });
    return { success: true, message: `${p} 快捷登录已成功解绑` };
  });
}

// 入驻问卷的画像标签映射：与 021 迁移种下的 ops_bill.tags 一一对应，
// 同一标签可能被多个中文别名命中，因此保留全部别名。
const ONBOARDING_INDUSTRY_TAGS = {
  自由创作: 'tag_ind_freelance',
  '个人 / 自媒体': 'tag_ind_media',
  自媒体: 'tag_ind_media',
  短漫剧: 'tag_ind_anime',
  游戏: 'tag_ind_game',
  游戏美术: 'tag_ind_game',
  电商: 'tag_ind_ecommerce',
  电商设计: 'tag_ind_ecommerce',
  广告: 'tag_ind_ad',
  商业广告: 'tag_ind_ad',
  MV: 'tag_ind_mv',
  音乐MV: 'tag_ind_mv',
};

const ONBOARDING_FEATURE_TAGS = {
  image: 'tag_pref_image',
  video: 'tag_pref_video',
  workflow: 'tag_pref_workflow',
  agent: 'tag_pref_agent',
};

function onboardingField(value, maxLength, label) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > maxLength) {
    throw Object.assign(new Error(`${label}最多 ${maxLength} 个字符`), { code: 'ONBOARDING_FIELD_TOO_LONG' });
  }
  return text;
}

export async function submitUserOnboarding({
  userId,
  displayName,
  fallbackDisplayName = null,
  zodiac,
  industry,
  occupation,
  preferences,
}) {
  const profile = {
    displayName: onboardingField(displayName, 50, '昵称') || fallbackDisplayName || null,
    zodiac: onboardingField(zodiac, 32, '星座'),
    industry: onboardingField(industry, 64, '行业'),
    occupation: onboardingField(occupation, 64, '职业'),
  };
  const submittedPreferences = preferences && typeof preferences === 'object' ? preferences : {};
  const tagIds = new Set();
  const industryTag = profile.industry ? ONBOARDING_INDUSTRY_TAGS[profile.industry] : null;
  if (industryTag) tagIds.add(industryTag);
  const features = Array.isArray(submittedPreferences.features) ? submittedPreferences.features : [];
  for (const feature of features) {
    const tagId = ONBOARDING_FEATURE_TAGS[feature];
    if (tagId) tagIds.add(tagId);
  }

  return withTransaction(async (tx) => {
    const updated = await authRepo.updateUserOnboarding({ userId, ...profile, preferences: submittedPreferences }, tx);
    if (!updated) throw Object.assign(new Error('账户不存在'), { code: 'USER_NOT_FOUND' });
    for (const tagId of tagIds) await userRepo.addUserTag(userId, tagId, 'onboarding', tx);
    return { profile: updated, tagIds: [...tagIds] };
  });
}

export async function getUserFromRequest(request) {
  const cookie = request?.cookies?.get?.('ko_session')?.value || request?.headers?.get?.('cookie')?.match?.(/ko_session=([^;]+)/)?.[1];
  return getUserBySession(cookie);
}

export function setSessionCookie(response, token, expires) {
  response.cookies.set('ko_session', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', expires: new Date(expires) });
}

export function clearSessionCookie(response) {
  response.cookies.set('ko_session', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: 0 });
}

