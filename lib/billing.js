import 'server-only';

import crypto from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { withTransaction, nowIso, randomId, query, queryOne, execute } from './db/index.js';

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
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) {
    return '请输入有效的邮箱地址';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    return '密码长度需为 8–200 个字符';
  }
  return null;
}

const INITIAL_SIGNUP_CREDITS = Number(process.env.INITIAL_SIGNUP_CREDITS || 10);

/**
 * 创建或获取手机号用户（支持手机号验证码一键登录/注册）
 */
export async function findOrCreateUserByPhone({ phone, countryCode = '+86', registrationSource = 'web', ip = null }) {
  const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').trim();
  const fullPhone = cleanPhone.startsWith('+') ? cleanPhone : `${countryCode}${cleanPhone}`;
  const now = nowIso();

  // 1. 查找 auth_accounts 是否已有该手机号
  const boundAccount = await queryOne(`
    SELECT user_id FROM auth_accounts WHERE provider = 'phone' AND provider_user_id = $1
  `, [fullPhone]);

  if (boundAccount) {
    const user = await queryOne(`
      SELECT id, uuid, email, phone, phone_country_code, display_name, avatar_url, role, credits, status
      FROM users WHERE id = $1
    `, [boundAccount.user_id]);

    if (!user) {
      return { error: 'USER_NOT_FOUND', message: '关联用户档案不存在' };
    }
    if (user.status === 'suspended') {
      return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，请联系客服' };
    }

    await execute('UPDATE users SET last_login_at = $1, last_login_ip = $2 WHERE id = $3', [now, ip, user.id]);
    await execute('UPDATE auth_accounts SET last_login_at = $1 WHERE provider = \'phone\' AND provider_user_id = $2', [now, fullPhone]);

    return { user, isNew: false };
  }

  // 2. 检查 users 主表是否已有此手机号
  let existingUser = await queryOne(`
    SELECT id, uuid, email, phone, phone_country_code, display_name, avatar_url, role, credits, status
    FROM users WHERE phone = $1
  `, [cleanPhone]);

  if (existingUser) {
    // 补全 auth_accounts 记录
    const accId = `acc_ph_${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, created_at, updated_at, last_login_at)
      VALUES ($1, $2, 'phone', $3, $4, $5, $6)
      ON CONFLICT (provider, provider_user_id) DO NOTHING
    `, [accId, existingUser.id, fullPhone, now, now, now]);

    await execute('UPDATE users SET last_login_at = $1, last_login_ip = $2 WHERE id = $3', [now, ip, existingUser.id]);
    return { user: existingUser, isNew: false };
  }

  // 3. 创建全新用户
  const userId = `usr_${crypto.randomBytes(16).toString('hex')}`;
  const displayName = `用户${cleanPhone.slice(-4)}`;
  const credits = INITIAL_SIGNUP_CREDITS;

  await execute(`
    INSERT INTO users (
      id, display_name, phone, phone_country_code, role, credits, status,
      registration_source, last_login_at, last_login_ip, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'user', $5, 'active', $6, $7, $8, $9, $10)
  `, [userId, displayName, cleanPhone, countryCode, credits, registrationSource, now, ip, now, now]);

  // 4. 在 auth_accounts 中建立凭据关联
  const accId = `acc_ph_${crypto.randomBytes(8).toString('hex')}`;
  await execute(`
    INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, created_at, updated_at, last_login_at)
    VALUES ($1, $2, 'phone', $3, $4, $5, $6)
  `, [accId, userId, fullPhone, now, now, now]);

  // 5. 发放初始额度与流水记录
  if (credits > 0) {
    try {
      const ledId = `led_${crypto.randomBytes(12).toString('hex')}`;
      await execute(`
        INSERT INTO credit_ledger (id, user_id, delta, reason, reference_id, created_at)
        VALUES ($1, $2, $3, '新用户手机注册体验额度', null, $4)
      `, [ledId, userId, credits, now]);
    } catch {}
  }

  // 6. 绑定新用户运营标签
  try {
    await execute(`
      INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
      VALUES ($1, 'tag_new', $2, 'system')
      ON CONFLICT (user_id, tag_id) DO NOTHING
    `, [userId, now]);
  } catch {}

  const newUser = await queryOne(`
    SELECT id, uuid, email, phone, phone_country_code, display_name, avatar_url, role, credits, status
    FROM users WHERE id = $1
  `, [userId]);

  return { user: newUser, isNew: true };
}

/**
 * 邮箱密码注册新用户
 */
export async function createUser(email, password, { registrationSource = 'web', ip = null } = {}) {
  const normalized = normalizeEmail(email);
  const now = nowIso();

  // 1. 检查 auth_accounts 与 users 是否已存在此邮箱
  const existingAcc = await queryOne(`
    SELECT user_id FROM auth_accounts WHERE provider = 'email' AND LOWER(provider_user_id) = $1
  `, [normalized]);

  if (existingAcc) return { error: '该邮箱已注册，请直接登录' };

  const existingUser = await queryOne(`
    SELECT id FROM users WHERE LOWER(email) = $1
  `, [normalized]);

  if (existingUser) return { error: '该邮箱已注册，请直接登录' };

  const { salt, hash } = passwordHash(password);
  const userId = `usr_${crypto.randomBytes(16).toString('hex')}`;
  const displayName = normalized.split('@')[0];
  const credits = INITIAL_SIGNUP_CREDITS;

  // 2. 插入 users 主表
  await execute(`
    INSERT INTO users (
      id, email, password_hash, password_salt, display_name, role, credits, status,
      registration_source, last_login_at, last_login_ip, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, 'user', $6, 'active', $7, $8, $9, $10, $11)
  `, [userId, normalized, hash, salt, displayName, credits, registrationSource, now, ip, now, now]);

  // 3. 插入 auth_accounts 表
  const accId = `acc_em_${crypto.randomBytes(8).toString('hex')}`;
  await execute(`
    INSERT INTO auth_accounts (
      id, user_id, provider, provider_user_id, provider_email, password_hash, password_salt, created_at, updated_at, last_login_at
    ) VALUES ($1, $2, 'email', $3, $4, $5, $6, $7, $8, $9)
  `, [accId, userId, normalized, normalized, hash, salt, now, now, now]);

  // 4. 赠送体验额度
  if (credits > 0) {
    try {
      const ledId = `led_${crypto.randomBytes(12).toString('hex')}`;
      await execute(`
        INSERT INTO credit_ledger (id, user_id, delta, reason, reference_id, created_at)
        VALUES ($1, $2, $3, '新用户邮箱注册体验额度', null, $4)
      `, [ledId, userId, credits, now]);
    } catch {}
  }

  // 5. 绑定新用户标签
  try {
    await execute(`
      INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
      VALUES ($1, 'tag_new', $2, 'system')
      ON CONFLICT (user_id, tag_id) DO NOTHING
    `, [userId, now]);
  } catch {}

  const user = await queryOne(`
    SELECT id, uuid, email, phone, display_name, role, credits, status FROM users WHERE id = $1
  `, [userId]);

  return { user };
}

/**
 * 邮箱密码登录校验
 */
export async function authenticateUser(email, password, ip = null) {
  const normalized = normalizeEmail(email);

  // 1. 优先从 auth_accounts 检索 email 凭据
  let acc = await queryOne(`
    SELECT user_id, password_hash, password_salt FROM auth_accounts
    WHERE provider = 'email' AND LOWER(provider_user_id) = $1
  `, [normalized]);

  // 兼容 users 表中的历史凭据
  if (!acc) {
    const legacy = await queryOne(`
      SELECT id AS user_id, password_hash, password_salt FROM users WHERE LOWER(email) = $1
    `, [normalized]);
    if (legacy && legacy.password_hash) acc = legacy;
  }

  if (!acc || !acc.password_hash) return null;

  const { hash } = passwordHash(password, acc.password_salt);
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(acc.password_hash, 'hex');
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  const user = await queryOne(`
    SELECT id, uuid, email, phone, display_name, role, status, credits FROM users WHERE id = $1
  `, [acc.user_id]);

  if (!user) return null;
  if (user.status === 'suspended') {
    return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，如有疑问请联系客服支持' };
  }

  const now = nowIso();
  await execute('UPDATE users SET last_login_at = $1, last_login_ip = $2 WHERE id = $3', [now, ip, user.id]);
  await execute('UPDATE auth_accounts SET last_login_at = $1 WHERE provider = \'email\' AND LOWER(provider_user_id) = $2', [now, normalized]);

  return user;
}

/**
 * 创建或绑定第三方 OAuth 账号 (Google / TikTok / X 等)
 */
export async function createOAuthUser({ provider, providerUserId, email, displayName, avatarUrl, profile = null, ip = null }) {
  const normalizedEmail = email ? normalizeEmail(email) : null;
  const now = nowIso();

  // 1. 检查 auth_accounts 中该平台账号是否已被绑定
  const bound = await queryOne(`
    SELECT user_id FROM auth_accounts WHERE provider = $1 AND provider_user_id = $2
  `, [provider, String(providerUserId)]);

  if (bound) {
    const existingUser = await queryOne(`
      SELECT id, uuid, email, phone, display_name, avatar_url, role, credits, status
      FROM users WHERE id = $1
    `, [bound.user_id]);

    if (existingUser) {
      if (existingUser.status === 'suspended') {
        return { error: 'ACCOUNT_SUSPENDED', message: '账户已被管理员封禁，无法登录' };
      }
      await execute('UPDATE users SET last_login_at = $1, last_login_ip = $2 WHERE id = $3', [now, ip, existingUser.id]);
      await execute('UPDATE auth_accounts SET last_login_at = $1, updated_at = $2 WHERE provider = $3 AND provider_user_id = $4', [now, now, provider, String(providerUserId)]);
      return existingUser;
    }
  }

  // 2. 若未绑定，但第三方返回了 verified email，检查是否与现有用户关联（安全合并去重）
  let targetUser = null;
  if (normalizedEmail) {
    targetUser = await queryOne(`
      SELECT id, uuid, email, phone, display_name, avatar_url, role, credits, status
      FROM users WHERE LOWER(email) = $1
    `, [normalizedEmail]);
  }

  if (targetUser) {
    // 已经有同名邮箱用户，直接将该三方凭据绑定到该用户主体
    const accId = `acc_${provider.slice(0, 2)}_${crypto.randomBytes(8).toString('hex')}`;
    await execute(`
      INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, provider_email, provider_username, profile_json, created_at, updated_at, last_login_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (provider, provider_user_id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        updated_at = EXCLUDED.updated_at,
        last_login_at = EXCLUDED.last_login_at
    `, [accId, targetUser.id, provider, String(providerUserId), normalizedEmail, displayName, profile ? JSON.stringify(profile) : null, now, now, now]);

    await execute('UPDATE users SET last_login_at = $1, last_login_ip = $2 WHERE id = $3', [now, ip, targetUser.id]);
    return targetUser;
  }

  // 3. 用户完全不存在，创建新用户主体
  const userId = `usr_${crypto.randomBytes(16).toString('hex')}`;
  const credits = INITIAL_SIGNUP_CREDITS;

  await execute(`
    INSERT INTO users (
      id, email, display_name, avatar_url, role, credits, status,
      registration_source, last_login_at, last_login_ip, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, 'user', $5, 'active', $6, $7, $8, $9, $10)
  `, [userId, normalizedEmail, displayName || `${provider}_user`, avatarUrl || null, credits, provider, now, ip, now, now]);

  // 4. 插入 auth_accounts 凭据
  const accId = `acc_${provider.slice(0, 2)}_${crypto.randomBytes(8).toString('hex')}`;
  await execute(`
    INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, provider_email, provider_username, profile_json, created_at, updated_at, last_login_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [accId, userId, provider, String(providerUserId), normalizedEmail, displayName, profile ? JSON.stringify(profile) : null, now, now, now]);

  // 5. 初始额度流水与标签
  if (credits > 0) {
    try {
      const ledId = `led_${crypto.randomBytes(12).toString('hex')}`;
      await execute(`
        INSERT INTO credit_ledger (id, user_id, delta, reason, reference_id, created_at)
        VALUES ($1, $2, $3, '${provider} 快捷登录体验额度', null, $4)
      `, [ledId, userId, credits, now]);
    } catch {}
  }

  try {
    await execute(`
      INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
      VALUES ($1, 'tag_new', $2, 'system')
      ON CONFLICT (user_id, tag_id) DO NOTHING
    `, [userId, now]);
  } catch {}

  const newUser = await queryOne(`
    SELECT id, uuid, email, phone, display_name, avatar_url, role, credits, status
    FROM users WHERE id = $1
  `, [userId]);

  return newUser;
}

/**
 * 签发 Session Token
 */
export async function createSession(userId) {
  const token = crypto.randomBytes(32).toString('base64url');
  const ttlDays = Math.max(1, Number(process.env.BILLING_SESSION_TTL_DAYS || 30));
  const expires = new Date(Date.now() + ttlDays * 86400000).toISOString();
  await execute('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [
    hashToken(token),
    userId,
    expires,
    nowIso()
  ]);
  return { token, expires };
}

/**
 * 注销 Session Token
 */
export async function deleteSession(token) {
  if (!token) return;
  await execute('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

/**
 * 通过 Session Token 获取统一 currentUser 对象
 */
export async function getUserBySession(token) {
  if (!token) return null;
  const row = await queryOne(`
    SELECT u.id, u.uuid, u.email, u.phone, u.phone_country_code, u.display_name, u.avatar_url, u.role, u.credits, u.status, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1
  `, [hashToken(token)]);

  if (!row) return null;
  if (row.status === 'suspended') {
    await deleteSession(token);
    return null;
  }
  if (new Date(row.expires_at).getTime() <= Date.now()) {
    await deleteSession(token);
    return null;
  }

  // 查询用户绑定的所有登录方式 (auth_accounts)
  const accountsRes = await query(`
    SELECT provider, provider_user_id, created_at FROM auth_accounts WHERE user_id = $1
  `, [row.id]);
  const loginProviders = [...new Set(accountsRes.rows.map(a => a.provider))];

  // 查询用户运营标签
  const tagsRes = await query(`
    SELECT t.id, t.name, t.slug, t.color
    FROM user_tags ut
    JOIN tags t ON t.id = ut.tag_id
    WHERE ut.user_id = $1
  `, [row.id]);

  return {
    id: row.id,
    uuid: row.uuid,
    displayName: row.display_name || (row.phone ? `用户${row.phone.slice(-4)}` : row.email?.split('@')[0]) || '创作者',
    avatar: row.avatar_url || null,
    email: row.email || null,
    phone: row.phone || null,
    phoneCountryCode: row.phone_country_code || '+86',
    role: row.role || 'user',
    status: row.status || 'active',
    credits: Number(row.credits || 0),
    loginProviders,
    tags: tagsRes.rows,
  };
}

export async function getUserFromRequest(request) {
  const cookie = request?.cookies?.get?.('ko_session')?.value || request?.headers?.get?.('cookie')?.match?.(/ko_session=([^;]+)/)?.[1];
  return await getUserBySession(cookie);
}

export function setSessionCookie(response, token, expires) {
  response.cookies.set('ko_session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    expires: new Date(expires),
  });
}

export function clearSessionCookie(response) {
  response.cookies.set('ko_session', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
}

export const PLANS = [
  {
    id: 'free', name: 'BYOK 基础', monthlyCny: 0, monthlyUsd: 0,
    features: ['保留自有 API Key（BYOK）', '基础图片工作流', '本地浏览器密钥存储'],
  },
  {
    id: 'pro', name: 'BYOK 专业版', monthlyCny: 29, monthlyUsd: 5,
    features: ['包含 BYOK 基础能力', '高级图片/视频/音频工具', '工作流与 Agent 权限', '优先额度与订阅管理'],
  },
  {
    id: 'team', name: '团队版', monthlyCny: 99, monthlyUsd: 19,
    features: ['包含专业版能力', '团队席位与共享工作流', '商业使用支持与审计入口'],
  },
];

export function getPlan(planId) {
  return PLANS.find((plan) => plan.id === planId) || null;
}

export async function createOrder({ userId, provider, plan, amountMinor, currency }) {
  const id = randomId('order');
  await execute(`
    INSERT INTO orders (id, user_id, provider, plan_id, status, amount_minor, currency, version, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'pending', $5, $6, 1, $7, $7)
  `, [id, userId, provider, plan.id, amountMinor, currency, nowIso()]);
  return id;
}

export async function updateOrder(orderId, updates = {}) {
  const allowed = ['status', 'provider_order_id', 'checkout_url', 'failure_code', 'paid_at', 'refunded_at'];
  const entries = Object.entries(updates).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (!entries.length) return queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
  const values = [orderId];
  const set = entries.map(([key, value], index) => { values.push(value); return `${key} = $${index + 2}`; });
  values.push(nowIso());
  await execute(`UPDATE orders SET ${set.join(', ')}, updated_at = $${values.length} WHERE id = $1`, values);
  return queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
}

export async function upsertSubscription({ userId, provider, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd }) {
  const id = randomId('sub');
  const now = nowIso();
  return queryOne(`
    INSERT INTO subscriptions (id, user_id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, last_synced_at, version, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, $9, $9)
    ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET
      user_id = EXCLUDED.user_id, provider_customer_id = EXCLUDED.provider_customer_id,
      plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
      last_synced_at = EXCLUDED.last_synced_at, version = subscriptions.version + 1, updated_at = EXCLUDED.updated_at
    RETURNING *
  `, [id, userId, provider, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, now]);
}

export async function recordWebhookEvent(provider, eventId, payload = null, headers = null) {
  const row = await queryOne(`
    INSERT INTO webhook_events (provider, event_id, status, attempts, payload_json, headers_json, created_at)
    VALUES ($1, $2, 'received', 1, $3::jsonb, $4::jsonb, $5)
    ON CONFLICT (provider, event_id) DO NOTHING
    RETURNING event_id
  `, [provider, eventId, payload ? JSON.stringify(payload) : null, headers ? JSON.stringify(headers) : null, nowIso()]);
  return Boolean(row);
}

export async function getSubscription(userId) {
  return await queryOne(`
    SELECT id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, created_at, updated_at
    FROM subscriptions WHERE user_id = $1 AND status IN ('active','trialing','past_due')
    ORDER BY updated_at DESC LIMIT 1
  `, [userId]);
}

import { getCreditWallet, commitCredits, reserveCredits } from './financial/creditService.js';
import { getCurrencyWallet } from './financial/currencyService.js';

export async function getEntitlements(userId) {
  const subscription = await getSubscription(userId);
  const plan = getPlan(subscription?.plan_id || 'free');
  const isPaid = Boolean(subscription && ['active', 'trialing'].includes(subscription.status));
  const creditWallet = await getCreditWallet(userId);
  const currencyWallet = await getCurrencyWallet(userId);
  const credits = creditWallet ? creditWallet.totalAvailable : await getCreditBalance(userId);

  return {
    planId: isPaid ? plan.id : 'free',
    planName: isPaid ? plan.name : getPlan('free').name,
    status: subscription?.status || 'free',
    provider: subscription?.provider || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    features: plan.features,
    credits,
    creditBuckets: creditWallet || null,
    currencyWallet: currencyWallet || null,
    byok: true,
    advanced: isPaid,
  };
}

export async function getCreditBalance(userId) {
  const creditWallet = await getCreditWallet(userId);
  if (creditWallet) {
    return creditWallet.totalAvailable;
  }
  const row = await queryOne('SELECT credits FROM users WHERE id = $1', [userId]);
  return Number(row?.credits || 0);
}

export async function recordCreation({
  userId,
  studioId,
  label = null,
  resultUrl = null,
  status = 'completed',
  creditCost = 0,
  reservationId = null,
  metadata = {}
}) {
  const creationId = `cre_${crypto.randomBytes(12).toString('hex')}`;
  const now = nowIso();

  // 如果传入了预冻结单号，且生成成功，自动触发两阶段 Commit 结算
  if (reservationId && status === 'completed') {
    try {
      await commitCredits({
        reservationId,
        creationId,
        settledAmount: creditCost || null,
      });
    } catch (e) {
      console.warn('[recordCreation] 预冻结结算警告:', e.message);
    }
  }

  await execute(`
    INSERT INTO creations (id, user_id, studio_id, label, result_url, status, credit_cost, metadata_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
  `, [creationId, userId, studioId, label, resultUrl, status, creditCost, JSON.stringify(metadata), now]);

  return { id: creationId, created_at: now };
}


export async function listCreations(userId, limit = 50, studioId = '') {
  let sql = 'SELECT * FROM creations WHERE user_id = $1';
  const params = [userId];
  if (studioId) {
    sql += ' AND studio_id = $1';
    params.push(studioId);
  }
  sql += ' ORDER BY created_at DESC LIMIT $1';
  params.push(Math.min(100, Number(limit) || 50));
  const res = await query(sql, params);
  return res.rows;
}

export async function deleteCreation(userId, id) {
  const changed = await execute('DELETE FROM creations WHERE id = $1 AND user_id = $2', [id, userId]);
  return changed > 0;
}
