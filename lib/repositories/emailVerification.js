import { execute, query, queryOne, randomId } from '../db/index.js';

function one(transaction) {
  return transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
}

function many(transaction) {
  return transaction?.query ? transaction.query.bind(transaction) : query;
}

function write(transaction) {
  return transaction?.execute ? transaction.execute.bind(transaction) : execute;
}

export async function pruneEmailVerificationCodes(email, transaction = null) {
  return write(transaction)(`
    DELETE FROM sys_core.auth_verification_codes
    WHERE target = $1 AND type = 'email_bind'
      AND (expires_at <= NOW() OR used_at IS NOT NULL)
  `, [email]);
}

export async function createEmailVerificationCode({ id, email, codeHash, expiresAt, requestIp }, transaction = null) {
  return one(transaction)(`
    INSERT INTO sys_core.auth_verification_codes
      (id, target, code, type, attempts, expires_at, used_at, created_at, request_ip)
    VALUES ($1, $2, $3, 'email_bind', 0, $4, NULL, NOW(), $5)
    RETURNING id, target, expires_at
  `, [id, email, codeHash, expiresAt, requestIp || null]);
}

export async function findLatestEmailVerificationCodeForUpdate(email, transaction) {
  return one(transaction)(`
    SELECT id, target, code, attempts, expires_at, used_at
    FROM sys_core.auth_verification_codes
    WHERE target = $1 AND type = 'email_bind'
    ORDER BY created_at DESC
    LIMIT 1
    FOR UPDATE
  `, [email]);
}

export async function incrementEmailVerificationAttempts(id, transaction) {
  return write(transaction)(`
    UPDATE sys_core.auth_verification_codes
    SET attempts = attempts + 1
    WHERE id = $1 AND used_at IS NULL
  `, [id]);
}

export async function markEmailVerificationCodeUsed(id, transaction) {
  return write(transaction)(`
    UPDATE sys_core.auth_verification_codes
    SET used_at = NOW()
    WHERE id = $1 AND used_at IS NULL
  `, [id]);
}

export async function emailOwnedByAnotherUser(email, userId, transaction) {
  const result = await many(transaction)(`
    SELECT id FROM auth_usr.users
    WHERE LOWER(email) = $1 AND id <> $2
    UNION
    SELECT user_id AS id FROM auth_usr.auth_accounts
    WHERE provider = 'email' AND LOWER(provider_user_id) = $1 AND user_id <> $2
    LIMIT 1
  `, [email, userId]);
  return result.rows.length > 0;
}

export async function bindVerifiedEmail({ userId, email }, transaction) {
  const runOne = one(transaction);
  const runWrite = write(transaction);
  const user = await runOne('SELECT id, password_hash, password_salt FROM auth_usr.users WHERE id = $1 FOR UPDATE', [userId]);
  if (!user) return { error: 'USER_NOT_FOUND', message: '用户账户不存在' };
  if (await emailOwnedByAnotherUser(email, userId, transaction)) {
    return { error: 'EMAIL_ALREADY_BOUND', message: '该邮箱已被其他账户绑定' };
  }

  const account = await runOne("SELECT id FROM auth_usr.auth_accounts WHERE user_id = $1 AND provider = 'email' FOR UPDATE", [userId]);
  await runWrite('UPDATE auth_usr.users SET email = $1, email_verified_at = NOW(), updated_at = NOW() WHERE id = $2', [email, userId]);
  if (account) {
    await runWrite(`
      UPDATE auth_usr.auth_accounts
      SET provider_user_id = $1, provider_email = $1, updated_at = NOW()
      WHERE id = $2
    `, [email, account.id]);
  } else {
    await runWrite(`
      INSERT INTO auth_usr.auth_accounts
        (id, user_id, provider, provider_user_id, provider_email, password_hash, password_salt, created_at, updated_at)
      VALUES ($1, $2, 'email', $3, $3, $4, $5, NOW(), NOW())
    `, [randomId('email'), userId, email, user.password_hash || null, user.password_salt || null]);
  }
  return { success: true, email };
}
