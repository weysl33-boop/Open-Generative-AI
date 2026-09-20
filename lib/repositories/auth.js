import { execute, nowIso, query, queryOne, randomId } from '../db/index.js';

export async function recordAuthEvent({ eventType, target = null, requestIp = null, metadata = {}, transaction = null }) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return await run(`
    INSERT INTO auth_events (id, event_type, target, request_ip, metadata_json, created_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6)
  `, [randomId('auth'), eventType, target, requestIp, JSON.stringify(metadata || {}), nowIso()]);
}

function one(transaction) {
  return transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
}

function many(transaction) {
  return transaction?.queryMany
    ? transaction.queryMany.bind(transaction)
    : async (...args) => (await query(...args)).rows;
}

function write(transaction) {
  return transaction?.execute ? transaction.execute.bind(transaction) : execute;
}

export async function findPhoneAccount(providerUserId, transaction = null) {
  return one(transaction)("SELECT user_id FROM auth_accounts WHERE provider = 'phone' AND provider_user_id = $1 FOR UPDATE", [providerUserId]);
}

export async function findUserForUpdate(userId, transaction = null) {
  return one(transaction)(`SELECT id, uuid, email, phone, phone_country_code, display_name, avatar_url, role, credits, status
    FROM users WHERE id = $1 FOR UPDATE`, [userId]);
}

export async function findUserByPhoneForUpdate(phone, transaction = null) {
  return one(transaction)(`SELECT id, uuid, email, phone, phone_country_code, display_name, avatar_url, role, credits, status
    FROM users WHERE phone = $1 FOR UPDATE`, [phone]);
}

export async function findEmailAccountForUpdate(email, transaction = null) {
  return one(transaction)("SELECT user_id FROM auth_accounts WHERE provider = 'email' AND LOWER(provider_user_id) = $1 FOR UPDATE", [email]);
}

export async function findUserByIdBasic(userId) {
  return queryOne(`SELECT id, uuid, email, phone, display_name, role, status, credits FROM users WHERE id = $1`, [userId]);
}

export async function findUserByEmailForUpdate(email, transaction = null) {
  return one(transaction)(`SELECT id, uuid, email, phone, phone_country_code, display_name, avatar_url, role, credits, status
    FROM users WHERE LOWER(email) = $1`, [email]);
}

export async function findOAuthAccount(provider, providerUserId, transaction = null) {
  return one(transaction)('SELECT user_id FROM auth_accounts WHERE provider = $1 AND provider_user_id = $2', [provider, providerUserId]);
}

export async function findOAuthBindingForUpdate(provider, providerUserId, transaction = null) {
  return one(transaction)('SELECT user_id FROM auth_accounts WHERE provider = $1 AND provider_user_id = $2 FOR UPDATE', [provider, providerUserId]);
}

export async function checkUserNumberExists(userNumber, transaction = null) {
  const row = await one(transaction)('SELECT 1 FROM users WHERE user_number = $1', [userNumber]);
  return Boolean(row);
}

export async function findUserByNumberForUpdate(userNumber, transaction = null) {
  return one(transaction)(`SELECT id, uuid, user_number, email, phone, phone_country_code, display_name, avatar_url, role, credits, status
    FROM users WHERE user_number = $1 FOR UPDATE`, [userNumber]);
}

// hash 与 salt 必须取自同一行：跨表逐列 COALESCE 会拼出「A 表 hash + B 表 salt」的
// 半凭据，scrypt 派生结果永不匹配，登录只会静默失败。
const CREDENTIAL_PAIRS = `
  a.password_hash AS account_password_hash, a.password_salt AS account_password_salt,
  u.password_hash AS user_password_hash,    u.password_salt AS user_password_salt
`;

function completeCredentialPair(userId, row) {
  const pair = [
    { hash: row?.account_password_hash, salt: row?.account_password_salt },
    { hash: row?.user_password_hash, salt: row?.user_password_salt },
  ].find((c) => c.hash && c.salt);
  return pair ? { user_id: userId, password_hash: pair.hash, password_salt: pair.salt } : null;
}

export async function findCredentialByAccount(identifier) {
  const clean = String(identifier || '').trim().toLowerCase();
  if (!clean) return null;

  // 1. 6 位数字 ID 登录
  if (/^\d{6}$/.test(clean)) {
    const row = await queryOne(`
      SELECT u.id AS user_id, ${CREDENTIAL_PAIRS}
      FROM users u
      LEFT JOIN auth_accounts a ON a.user_id = u.id AND a.provider = 'email'
      WHERE u.user_number = $1
      ORDER BY a.created_at ASC NULLS LAST
      LIMIT 1
    `, [clean]);
    const credential = completeCredentialPair(row?.user_id, row);
    if (credential) return credential;
  }

  // 2. auth_accounts 邮箱
  const accountRow = await queryOne(`
    SELECT a.user_id, ${CREDENTIAL_PAIRS}
    FROM auth_accounts a
    LEFT JOIN users u ON u.id = a.user_id
    WHERE a.provider = 'email' AND LOWER(a.provider_user_id) = $1
    LIMIT 1
  `, [clean]);
  const accountCredential = completeCredentialPair(accountRow?.user_id, accountRow);
  if (accountCredential) return accountCredential;

  // 3. users 邮箱（历史数据可能只有主表凭据）
  const userRow = await queryOne(`
    SELECT u.id AS user_id, ${CREDENTIAL_PAIRS}
    FROM users u
    LEFT JOIN auth_accounts a ON a.user_id = u.id AND a.provider = 'email'
    WHERE LOWER(u.email) = $1
    ORDER BY a.created_at ASC NULLS LAST
    LIMIT 1
  `, [clean]);
  return completeCredentialPair(userRow?.user_id, userRow);
}

// 与登录走同一解析规则，避免「改密校验的是 users，登录用的是 auth_accounts」。
export async function findUserPasswordCredential(userId, transaction = null) {
  if (!userId) return null;
  const row = await one(transaction)(`
    SELECT ${CREDENTIAL_PAIRS}
    FROM users u
    LEFT JOIN auth_accounts a ON a.user_id = u.id AND a.provider = 'email'
    WHERE u.id = $1
    ORDER BY a.created_at ASC NULLS LAST
    LIMIT 1
  `, [userId]);
  return completeCredentialPair(userId, row);
}

// 密码只有一个写入口：主表与 email 账号必须同步落库，且不得覆盖第三方/手机账号的凭据列。
export async function setUserPassword({ userId, passwordHash, passwordSalt }, transaction = null) {
  const run = write(transaction);
  await run('UPDATE users SET password_hash = $1, password_salt = $2, updated_at = NOW() WHERE id = $3', [passwordHash, passwordSalt, userId]);
  await run("UPDATE auth_accounts SET password_hash = $1, password_salt = $2, updated_at = NOW() WHERE user_id = $3 AND provider = 'email'", [passwordHash, passwordSalt, userId]);
}


export async function insertUser({ id, userNumber, email = null, phone = null, phoneCountryCode = null, passwordHash = null, passwordSalt = null, displayName, avatarUrl = null, role = 'user', credits = 0, status = 'active', registrationSource, lastLoginAt, lastLoginIp, createdAt, updatedAt }, transaction = null) {
  return one(transaction)(`INSERT INTO users (
      id, user_number, email, phone, phone_country_code, password_hash, password_salt, display_name, avatar_url, role, credits, status,
      registration_source, last_login_at, last_login_ip, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
    RETURNING id, uuid, user_number, email, phone, phone_country_code, display_name, avatar_url, role, credits, status, is_activity_public, privacy_settings`,
  [id, userNumber, email, phone, phoneCountryCode, passwordHash, passwordSalt, displayName, avatarUrl, role, credits, status, registrationSource, lastLoginAt, lastLoginIp, createdAt, updatedAt]);
}

export async function insertEmailAccount({ id, userId, email, passwordHash, passwordSalt, timestamp }, transaction = null) {
  return write(transaction)(`INSERT INTO auth_accounts (
      id, user_id, provider, provider_user_id, provider_email, password_hash, password_salt, created_at, updated_at, last_login_at
    ) VALUES ($1, $2, 'email', $3, $4, $5, $6, $7, $8, $9)`, [id, userId, email, email, passwordHash, passwordSalt, timestamp, timestamp, timestamp]);
}

export async function insertOAuthAccount({ id, userId, provider, providerUserId, providerEmail, displayName, profile, timestamp }, transaction = null) {
  return one(transaction)(`INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, provider_email, provider_username, profile_json, created_at, updated_at, last_login_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    ON CONFLICT (provider, provider_user_id) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      provider_email = COALESCE(EXCLUDED.provider_email, auth_accounts.provider_email),
      provider_username = COALESCE(EXCLUDED.provider_username, auth_accounts.provider_username),
      profile_json = COALESCE(EXCLUDED.profile_json, auth_accounts.profile_json),
      updated_at = EXCLUDED.updated_at,
      last_login_at = EXCLUDED.last_login_at
    RETURNING user_id`, [id, userId, provider, providerUserId, providerEmail, displayName, profile ? JSON.stringify(profile) : null, timestamp, timestamp, timestamp]);
}

export async function updateUserEmailIfEmpty(userId, email, transaction = null) {
  if (!userId || !email) return null;
  const run = write(transaction);
  return run(`UPDATE users SET email = $1, email_verified_at = NOW(), updated_at = NOW() WHERE id = $2 AND (email IS NULL OR email = '')`, [email, userId]);
}

export async function updateUserAvatarIfEmpty(userId, avatarUrl, transaction = null) {
  if (!userId || !avatarUrl) return null;
  const run = write(transaction);
  return run(`UPDATE users SET avatar_url = $1, updated_at = NOW() WHERE id = $2 AND (avatar_url IS NULL OR avatar_url = '')`, [avatarUrl, userId]);
}

export async function insertPhoneAccount({ id, userId, providerUserId, timestamp, ignoreConflict = false }, transaction = null) {
  const suffix = ignoreConflict ? ' ON CONFLICT (provider, provider_user_id) DO NOTHING' : '';
  return write(transaction)(`INSERT INTO auth_accounts (id, user_id, provider, provider_user_id, created_at, updated_at, last_login_at)
    VALUES ($1, $2, 'phone', $3, $4, $5, $6)${suffix}`, [id, userId, providerUserId, timestamp, timestamp, timestamp]);
}

export async function addNewUserTag(userId, timestamp, transaction = null) {
  return write(transaction)(`INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
    VALUES ($1, 'tag_new', $2, 'system') ON CONFLICT (user_id, tag_id) DO NOTHING`, [userId, timestamp]);
}

export async function updateLoginMetadata({ userId, provider = null, providerUserId = null, timestamp, ip = null }, transaction = null) {
  const run = write(transaction);
  await run('UPDATE users SET last_login_at = $1, last_login_ip = $2 WHERE id = $3', [timestamp, ip, userId]);
  if (provider && providerUserId) {
    await run('UPDATE auth_accounts SET last_login_at = $1, updated_at = $1 WHERE provider = $2 AND provider_user_id = $3', [timestamp, provider, providerUserId]);
  }
}

export async function findUserSession(tokenHash) {
  return queryOne(`SELECT u.id, u.uuid, u.user_number, u.email, u.phone, u.phone_country_code, u.display_name, u.avatar_url, u.role, u.credits, u.status, u.is_activity_public, u.privacy_settings, u.locale, s.expires_at
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL`, [tokenHash]);
}

export async function findSessionOwnerForUpdate(tokenHash, transaction = null) {
  return one(transaction)('SELECT user_id FROM sessions WHERE token_hash = $1 FOR UPDATE', [tokenHash]);
}

export async function listLoginProviders(userId) {
  return many()("SELECT id, provider, provider_user_id, provider_email, provider_username, created_at, last_login_at FROM auth_accounts WHERE user_id = $1 ORDER BY created_at ASC", [userId]);
}

export async function listUserTags(userId) {
  return many()(`SELECT t.id, t.name, t.slug, t.color FROM user_tags ut JOIN tags t ON t.id = ut.tag_id WHERE ut.user_id = $1`, [userId]);
}

export async function getUserCredentialSummary(userId, transaction = null) {
  const user = await one(transaction)('SELECT password_hash, email, phone FROM users WHERE id = $1', [userId]);
  const accounts = await (transaction?.queryMany ? transaction.queryMany.bind(transaction) : async (...args) => (await query(...args)).rows)(
    'SELECT provider, provider_user_id FROM auth_accounts WHERE user_id = $1', [userId]
  );
  const hasPassword = Boolean(user?.password_hash);
  const hasEmail = Boolean(user?.email || accounts.some(a => a.provider === 'email'));
  const hasPhone = Boolean(user?.phone || accounts.some(a => a.provider === 'phone'));
  const oauthProviders = accounts.filter(a => a.provider !== 'email' && a.provider !== 'phone').map(a => a.provider);
  
  let validCredentialCount = 0;
  if (hasPassword && hasEmail) validCredentialCount += 1;
  if (hasPhone) validCredentialCount += 1;
  validCredentialCount += oauthProviders.length;
  if (hasPassword && !hasEmail && !hasPhone) validCredentialCount += 1; // 仅有账号密码

  return {
    hasPassword,
    hasEmail,
    hasPhone,
    oauthProviders: [...new Set(oauthProviders)],
    validCredentialCount,
  };
}

export async function removePhoneAccount(userId, transaction = null) {
  const run = write(transaction);
  await run("DELETE FROM auth_accounts WHERE user_id = $1 AND provider = 'phone'", [userId]);
  await run("UPDATE users SET phone = NULL, phone_verified_at = NULL, updated_at = NOW() WHERE id = $1", [userId]);
  return true;
}

export async function removeEmailAccount(userId, transaction = null) {
  const run = write(transaction);
  await run("DELETE FROM auth_accounts WHERE user_id = $1 AND provider = 'email'", [userId]);
  await run("UPDATE users SET email = NULL, email_verified_at = NULL, updated_at = NOW() WHERE id = $1", [userId]);
  return true;
}

export async function removeOAuthAccount(userId, provider, transaction = null) {
  const run = write(transaction);
  await run("DELETE FROM auth_accounts WHERE user_id = $1 AND provider = $2", [userId, provider]);
  return true;
}

export async function insertSession({ tokenHash, userId, expiresAt, timestamp }, transaction = null) {
  return write(transaction)('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [tokenHash, userId, expiresAt, timestamp]);
}

export async function lockSessionUser(tokenHash, transaction = null) {
  return one(transaction)(`SELECT s.user_id, s.expires_at, u.status FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.revoked_at IS NULL FOR UPDATE`, [tokenHash]);
}

export async function revokeSession(tokenHash, timestamp, transaction = null) {
  return write(transaction)('UPDATE sessions SET revoked_at = $1, last_seen_at = $1 WHERE token_hash = $2', [timestamp, tokenHash]);
}

export async function deleteSessionByHash(tokenHash, transaction = null) {
  return write(transaction)('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function rotateSession({ oldTokenHash, nextTokenHash, userId, expiresAt, timestamp }, transaction = null) {
  await revokeSession(oldTokenHash, timestamp, transaction);
  return insertSession({ tokenHash: nextTokenHash, userId, expiresAt, timestamp }, transaction);
}

