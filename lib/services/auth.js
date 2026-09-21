import 'server-only';

import crypto from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { nowIso, randomId, withTransaction } from '../db/index.js';
import { getCreditWallet, grantPerpetualCredits } from '../financial/creditService.js';
import * as authRepo from '../repositories/auth.js';
import * as userRepo from '../repositories/users.js';
import * as accountSettingsRepo from '../repositories/accountSettings.js';
import * as phoneIdentityRepo from '../repositories/phoneIdentity.js';
import { getPhoneLookupCandidates, maskPhone, normalizePhone } from '../auth/phone.js';
import {
  ONBOARDING_REWARD_CREDITS,
  ONBOARDING_SCHEMA_VERSION,
  ONBOARDING_STEP_IDENTITY,
  ONBOARDING_STEP_PREFERENCE,
  buildPersonaCode,
  normalizeNickname,
  normalizePreferenceAnswers,
  tagIdsForPreferences,
} from '../onboarding/schema.js';

const INITIAL_SIGNUP_CREDITS = Number(process.env.INITIAL_SIGNUP_CREDITS || 10);
const ONBOARDING_REWARD = Number(process.env.ONBOARDING_REWARD_CREDITS ?? ONBOARDING_REWARD_CREDITS);

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

export async function findOrCreateUserByPhone({
  phone,
  countryCode = '+86',
  registrationSource = 'web',
  verificationProvider = 'tencent_sms',
  providerUserIdExternal = null,
  ip = null,
}) {
  const normalized = normalizePhone(phone, countryCode);
  const fullPhone = normalized.e164;
  const candidates = getPhoneLookupCandidates(phone, countryCode);
  const now = nowIso();
  return withTransaction(async (tx) => {
    await authRepo.lockPhoneIdentity(fullPhone, tx);
    let boundAccount = null;
    let boundProviderUserId = fullPhone;
    for (const candidate of candidates) {
      boundAccount = await authRepo.findPhoneAccount(candidate, tx);
      if (boundAccount) {
        boundProviderUserId = candidate;
        break;
      }
    }
    if (boundAccount) {
      const user = await authRepo.findUserForUpdate(boundAccount.user_id, tx);
      if (!user) return { error: 'USER_NOT_FOUND', message: '关联用户档案不存在' };
      if (user.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，请联系客服' };
      const canonicalPhoneOwner = await authRepo.findUserByPhoneForUpdate(fullPhone, tx);
      if (canonicalPhoneOwner && canonicalPhoneOwner.id !== user.id) {
        return { error: 'PHONE_ALREADY_BOUND', message: '该手机号已绑定其他账户' };
      }
      if (boundProviderUserId !== fullPhone) {
        await authRepo.insertPhoneAccount({
          id: newAccountId('ph'), userId: user.id, providerUserId: fullPhone, timestamp: now,
          verificationProvider, providerUserIdExternal, ignoreConflict: true,
        }, tx);
      }
      if (user.phone !== fullPhone || user.phone_verified_at == null) {
        const updated = await authRepo.updateUserPhoneIdentity({ userId: user.id, phone: fullPhone, countryCode: normalized.callingCode, verifiedAt: now }, tx);
        if (updated) Object.assign(user, updated);
      }
      await authRepo.updateLoginMetadata({ userId: user.id, provider: 'phone', providerUserId: fullPhone, timestamp: now, ip }, tx);
      await authRepo.recordAuthEvent({ eventType: 'LOGIN_SUCCESS', target: user.id, requestIp: ip, metadata: { provider: 'phone' }, transaction: tx });
      return { user: { ...user, last_login_at: now, last_login_ip: ip }, isNew: false };
    }

    let existingUser = null;
    for (const candidate of candidates) {
      existingUser = await authRepo.findUserByPhoneForUpdate(candidate, tx);
      if (existingUser) break;
    }
    if (existingUser) {
      if (existingUser.status === 'suspended') {
        return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，无法登录' };
      }
      if (existingUser.phone_verified_at == null) {
        return { error: 'PHONE_BINDING_REQUIRED', message: '该手机号已关联账户，请先使用原登录方式登录并绑定手机号' };
      }
      const conflict = await authRepo.findUserByPhoneForUpdate(fullPhone, tx);
      if (conflict && conflict.id !== existingUser.id) {
        return { error: 'PHONE_ALREADY_BOUND', message: '该手机号已绑定其他账户' };
      }
      await authRepo.insertPhoneAccount({
        id: newAccountId('ph'), userId: existingUser.id, providerUserId: fullPhone, timestamp: now,
        verificationProvider, providerUserIdExternal, ignoreConflict: true,
      }, tx);
      const updated = await authRepo.updateUserPhoneIdentity({ userId: existingUser.id, phone: fullPhone, countryCode: normalized.callingCode, verifiedAt: now }, tx);
      if (updated) Object.assign(existingUser, updated);
      await authRepo.updateLoginMetadata({ userId: existingUser.id, provider: 'phone', providerUserId: fullPhone, timestamp: now, ip }, tx);
      await authRepo.recordAuthEvent({ eventType: 'LOGIN_SUCCESS', target: existingUser.id, requestIp: ip, metadata: { provider: 'phone' }, transaction: tx });
      return { user: { ...existingUser, last_login_at: now, last_login_ip: ip }, isNew: false };
    }

    const userId = newUserId();
    const userNumber = await generateUniqueUserNumber(tx);
    const user = await authRepo.insertUser({
      id: userId,
      userNumber,
      phone: fullPhone,
      phoneCountryCode: normalized.callingCode,
      displayName: `用户#${userNumber}`,
      registrationSource,
      lastLoginAt: now,
      lastLoginIp: ip,
      createdAt: now,
      updatedAt: now
    }, tx);
    const verifiedUser = await authRepo.updateUserPhoneIdentity({ userId, phone: fullPhone, countryCode: normalized.callingCode, verifiedAt: now }, tx);
    if (verifiedUser) Object.assign(user, verifiedUser);
    await authRepo.insertPhoneAccount({
      id: newAccountId('ph'), userId, providerUserId: fullPhone, timestamp: now,
      verificationProvider, providerUserIdExternal,
    }, tx);
    if (INITIAL_SIGNUP_CREDITS > 0) await grantPerpetualCredits(userId, INITIAL_SIGNUP_CREDITS, '新用户手机注册体验额度', userId, `signup:phone:${userId}`, tx);
    await authRepo.addNewUserTag(userId, now, tx);
    await authRepo.recordAuthEvent({ eventType: 'LOGIN_SUCCESS', target: userId, requestIp: ip, metadata: { provider: 'phone', isNew: true }, transaction: tx });
    return { user, isNew: true };
  });
}

export async function bindPhoneToUser({ userId, phone, countryCode = '+86', verificationProvider = 'tencent_sms', providerUserIdExternal = null, ip = null }) {
  const normalized = normalizePhone(phone, countryCode);
  const candidates = getPhoneLookupCandidates(phone, countryCode);
  const now = nowIso();

  return withTransaction(async (tx) => {
    await authRepo.lockPhoneIdentity(normalized.e164, tx);
    const user = await authRepo.findUserForUpdate(userId, tx);
    if (!user) return { error: 'USER_NOT_FOUND', message: '当前账户不存在或已失效' };
    if (user.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED', message: '账户已被封禁' };

    for (const candidate of candidates) {
      const bound = await authRepo.findPhoneAccount(candidate, tx);
      if (bound && bound.user_id !== userId) {
        return { error: 'PHONE_ALREADY_BOUND', message: '该手机号码已绑定其他账户' };
      }
      const existing = await authRepo.findUserByPhoneForUpdate(candidate, tx);
      if (existing && existing.id !== userId) {
        return { error: 'PHONE_ALREADY_BOUND', message: '该手机号码已绑定其他账户' };
      }
    }

    const alreadyCurrent = user.phone === normalized.e164;
    if (!alreadyCurrent && user.phone) {
      await authRepo.removePhoneAccount(userId, tx);
    }
    const updated = await authRepo.updateUserPhoneIdentity({
      userId,
      phone: normalized.e164,
      countryCode: normalized.callingCode,
      verifiedAt: now,
    }, tx);
    if (!updated) return { error: 'USER_NOT_FOUND', message: '当前账户不存在或已失效' };
    await authRepo.insertPhoneAccount({
      id: newAccountId('ph'),
      userId,
      providerUserId: normalized.e164,
      timestamp: now,
      ignoreConflict: true,
      verificationProvider,
      providerUserIdExternal,
    }, tx);
    await authRepo.recordAuthEvent({
      eventType: alreadyCurrent ? 'PHONE_BOUND' : user.phone ? 'PHONE_CHANGED' : 'PHONE_BOUND',
      target: userId,
      requestIp: ip,
      metadata: {
        verificationProvider,
        oldPhone: user.phone ? maskPhone(user.phone, user.phone_country_code || '+86') : null,
        phone: maskPhone(normalized.e164),
      },
      transaction: tx,
    });
    await authRepo.recordAuthEvent({
      eventType: 'IDENTITY_LINKED',
      target: userId,
      requestIp: ip,
      metadata: { type: 'phone', verificationProvider, phone: maskPhone(normalized.e164) },
      transaction: tx,
    });
    return { success: true, user: updated };
  });
}

export async function recordPhoneLoginFailure({ phone, countryCode = '+86', reason = 'AUTH_FAILED', ip = null }) {
  let target = null;
  try {
    target = maskPhone(phone, countryCode);
  } catch {}
  return authRepo.recordAuthEvent({
    eventType: 'LOGIN_FAILED',
    target,
    requestIp: ip,
    metadata: { provider: 'phone', reason: String(reason).slice(0, 64) },
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
    await authRepo.recordAuthEvent({ eventType: 'LOGIN_SUCCESS', target: userId, requestIp: ip, metadata: { provider: 'email', isNew: true }, transaction: tx });
    return { user };
  });
}

export async function authenticateUser(identifier, password, ip = null) {
  const clean = String(identifier || '').trim();
  const credential = await authRepo.findCredentialByAccount(clean);
  if (!credential?.password_hash) {
    await authRepo.recordAuthEvent({ eventType: 'LOGIN_FAILED', requestIp: ip, metadata: { provider: 'email', reason: 'CREDENTIAL_NOT_FOUND' } });
    return null;
  }
  const { hash } = passwordHash(password, credential.password_salt);
  const actual = Buffer.from(hash, 'hex');
  const expected = Buffer.from(credential.password_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    await authRepo.recordAuthEvent({ eventType: 'LOGIN_FAILED', target: credential.user_id, requestIp: ip, metadata: { provider: 'email', reason: 'PASSWORD_MISMATCH' } });
    return null;
  }
  const user = await authRepo.findUserByIdBasic(credential.user_id);
  if (!user) {
    await authRepo.recordAuthEvent({ eventType: 'LOGIN_FAILED', target: credential.user_id, requestIp: ip, metadata: { provider: 'email', reason: 'USER_NOT_FOUND' } });
    return null;
  }
  if (user.status === 'suspended') {
    await authRepo.recordAuthEvent({ eventType: 'LOGIN_FAILED', target: user.id, requestIp: ip, metadata: { provider: 'email', reason: 'ACCOUNT_SUSPENDED' } });
    return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，如有疑问请联系客服支持' };
  }
  await authRepo.updateLoginMetadata({ userId: user.id, timestamp: nowIso(), ip });
  await authRepo.recordAuthEvent({ eventType: 'LOGIN_SUCCESS', target: user.id, requestIp: ip, metadata: { provider: 'email' } });
  return user;
}

export async function changeUserPassword({ userId, oldPassword = '', newPassword = '' }) {
  if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 200) {
    return { error: '新密码长度需为 8–200 个字符' };
  }
  const credential = await authRepo.findUserPasswordCredential(userId);
  if (credential) {
    if (!oldPassword) return { error: '请输入当前密码以验证身份' };
    const { hash } = passwordHash(oldPassword, credential.password_salt);
    const actual = Buffer.from(hash, 'hex');
    const expected = Buffer.from(credential.password_hash, 'hex');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      return { error: '当前密码输入错误' };
    }
  }
  const { salt, hash } = passwordHash(newPassword);
  await withTransaction((tx) => authRepo.setUserPassword({ userId, passwordHash: hash, passwordSalt: salt }, tx));
  return { success: true };
}

export async function deactivateUserAccount(userId) {
  return withTransaction((tx) => accountSettingsRepo.deactivateUserAccount(userId, tx));
}

export async function bindVerifiedPhoneIdentity(input) {
  return phoneIdentityRepo.bindVerifiedPhoneIdentity(input);
}

export async function recordVerifiedPhoneLogin(input) {
  return phoneIdentityRepo.recordVerifiedPhoneLogin(input);
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
        await authRepo.recordAuthEvent({ eventType: 'LOGIN_SUCCESS', target: existingUser.id, requestIp: ip, metadata: { provider }, transaction: tx });
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
      await authRepo.recordAuthEvent({ eventType: 'LOGIN_SUCCESS', target: targetUser.id, requestIp: ip, metadata: { provider }, transaction: tx });
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
    await authRepo.recordAuthEvent({ eventType: 'LOGIN_SUCCESS', target: userId, requestIp: ip, metadata: { provider, isNew: true }, transaction: tx });
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
    await authRepo.recordAuthEvent({ eventType: 'IDENTITY_LINKED', target: user.id, requestIp: ip, metadata: { type: 'oauth', provider }, transaction: tx });
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
    onboardingCompleted: row.onboarding_completed === true,
    onboardingStep: Number(row.onboarding_step || 0),
    onboardingSchemaVersion: Number(row.onboarding_schema_version || 1),
    personaCode: row.creator_persona_code || null,
    country: row.country || null,
    gender: row.gender || null,
    occupationCode: row.occupation_code || null,
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

// 头像只接受站内可控来源：默认头像库、本地上传目录，或三方返回的绝对地址。
function safeAvatarUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) return null;
  if (text.length > 500) throw Object.assign(new Error('头像地址过长'), { code: 'ONBOARDING_FIELD_TOO_LONG' });
  if (text.startsWith('/assets/avatars/') || text.startsWith('/uploads/avatars/')) return text;
  if (/^https?:\/\/[^\s]+$/i.test(text)) return text;
  throw Object.assign(new Error('头像地址不被支持'), { code: 'ONBOARDING_INVALID_AVATAR' });
}

function requireNickname(value) {
  const result = normalizeNickname(value);
  if (result.error) throw Object.assign(new Error(result.error), { code: 'ONBOARDING_INVALID_NICKNAME' });
  return result.value;
}

/**
 * 第一步：身份（昵称 + 头像）。只推进到 step 1，不置完成态。
 */
export async function submitOnboardingIdentity({ userId, displayName, avatarUrl, fallbackDisplayName = null }) {
  const nickname = requireNickname(
    typeof displayName === 'string' && displayName.trim() ? displayName : fallbackDisplayName,
  );
  return withTransaction(async (tx) => {
    const updated = await authRepo.updateUserOnboarding({
      userId,
      displayName: nickname,
      avatarUrl: safeAvatarUrl(avatarUrl),
      step: ONBOARDING_STEP_IDENTITY,
      answers: { identity: { nicknameSet: Boolean(nickname), avatarSource: avatarUrl ? 'chosen' : 'kept' } },
    }, tx);
    if (!updated) throw Object.assign(new Error('账户不存在'), { code: 'USER_NOT_FOUND' });
    return { profile: updated, tagIds: [] };
  });
}

/**
 * 第二步：习惯偏好。落库为受控枚举 + 一段可 group by 的人群短码，
 * 这是后续「自述 vs 实际行为」偏差分析的基线资产。
 */
export async function submitOnboardingPreferences({ userId, answers }) {
  const normalized = normalizePreferenceAnswers(answers);
  if (normalized.error) throw Object.assign(new Error(normalized.error), { code: 'ONBOARDING_INVALID_ANSWERS' });
  const value = normalized.value;
  const personaCode = buildPersonaCode(value);
  const tagIds = tagIdsForPreferences(value);

  return withTransaction(async (tx) => {
    const updated = await authRepo.updateUserOnboarding({
      userId,
      occupation: value.occupationLabel,
      occupationCode: value.occupation,
      purposeCodes: value.purposeCodes,
      commitment: value.commitment,
      styleCodes: value.styleCodes,
      usageIntent: value.usageIntent,
      personaCode,
      answers: {
        preference: { ...value, schemaVersion: ONBOARDING_SCHEMA_VERSION, answeredAt: nowIso() },
      },
      preferences: {
        occupationCode: value.occupation,
        purposeCodes: value.purposeCodes,
        commitment: value.commitment,
        styleCodes: value.styleCodes,
        usageIntent: value.usageIntent,
        allowTraining: value.allowTraining,
      },
      step: ONBOARDING_STEP_PREFERENCE,
      completed: true,
      schemaVersion: ONBOARDING_SCHEMA_VERSION,
    }, tx);
    if (!updated) throw Object.assign(new Error('账户不存在'), { code: 'USER_NOT_FOUND' });
    for (const tagId of tagIds) await userRepo.addUserTag(userId, tagId, 'onboarding', tx);
    // 幂等键挡住重放：同一用户重复提交只会到账一次，因此奖励可以安全地放在同一事务里。
    let rewardCredits = 0;
    if (ONBOARDING_REWARD > 0) {
      const grant = await grantPerpetualCredits(
        userId,
        ONBOARDING_REWARD,
        '完成创作偏好问卷奖励',
        userId,
        `onboarding:complete:${userId}`,
        tx,
      );
      rewardCredits = grant?.idempotent ? 0 : Number(grant?.granted || 0);
    }
    return { profile: updated, tagIds, personaCode, rewardCredits };
  });
}

/**
 * 跳过引导：只推进完成态，不写任何画像字段，也不发奖励。
 * 记录 skipped 是为了让运营侧把「主动跳过」与「未触达」区分开，
 * 而不是把空白画像误读成低活跃用户。
 */
export async function submitOnboardingSkip({ userId }) {
  return withTransaction(async (tx) => {
    const updated = await authRepo.updateUserOnboarding({
      userId,
      answers: {
        skipped: { schemaVersion: ONBOARDING_SCHEMA_VERSION, skippedAt: nowIso() },
      },
      preferences: { onboardingSkipped: true },
      step: ONBOARDING_STEP_PREFERENCE,
      completed: true,
      schemaVersion: ONBOARDING_SCHEMA_VERSION,
    }, tx);
    if (!updated) throw Object.assign(new Error('账户不存在'), { code: 'USER_NOT_FOUND' });
    return { profile: updated, tagIds: [], personaCode: null, rewardCredits: 0, skipped: true };
  });
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
    const updated = await authRepo.updateUserOnboarding({ userId, ...profile, preferences: submittedPreferences, step: ONBOARDING_STEP_PREFERENCE, completed: true }, tx);
    if (!updated) throw Object.assign(new Error('账户不存在'), { code: 'USER_NOT_FOUND' });
    for (const tagId of tagIds) await userRepo.addUserTag(userId, tagId, 'onboarding', tx);
    return { profile: updated, tagIds: [...tagIds] };
  });
}

// 登录出口据此决定落地页：未完成引导的用户一律先进 /onboarding。
export async function requiresOnboarding(userId) {
  const state = await authRepo.getOnboardingState(userId);
  return Boolean(state) && state.onboarding_completed !== true;
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
