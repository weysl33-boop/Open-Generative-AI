import { execute, queryOne } from '../db/index.js';

function read(transaction) {
  return transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
}

function write(transaction) {
  return transaction?.execute ? transaction.execute.bind(transaction) : execute;
}

export async function getUserAccountSettings(userId, transaction = null, { forUpdate = false } = {}) {
  const suffix = forUpdate ? ' FOR UPDATE' : '';
  return read(transaction)(`
    SELECT id, email, email_verified_at, locale, social_links
    FROM users WHERE id = $1${suffix}
  `, [userId]);
}

export async function updateUserAccountSettings(userId, patch = {}, transaction = null) {
  const columns = {
    email: 'email',
    emailVerifiedAt: 'email_verified_at',
    locale: 'locale',
    socialLinks: 'social_links',
  };
  const updates = [];
  const values = [userId];
  for (const [field, column] of Object.entries(columns)) {
    if (!Object.prototype.hasOwnProperty.call(patch, field)) continue;
    let value = patch[field];
    if (field === 'socialLinks') {
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue;
      value = JSON.stringify(value);
      values.push(value);
      updates.push(`${column} = $${values.length}::jsonb`);
      continue;
    }
    values.push(value);
    updates.push(`${column} = $${values.length}`);
  }
  if (!updates.length) return getUserAccountSettings(userId, transaction);
  updates.push('updated_at = NOW()');
  return read(transaction)(`
    UPDATE users SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, email, email_verified_at, locale, social_links
  `, values);
}

export async function updateUserAvatar(userId, avatarUrl) {
  return queryOne(`
    UPDATE users SET avatar_url = $1, updated_at = NOW()
    WHERE id = $2
    RETURNING id, email, phone, display_name, avatar_url, role, credits, status, locale
  `, [avatarUrl, userId]);
}

export async function deactivateUserAccount(userId, transaction) {
  const run = write(transaction);
  const updated = await run("UPDATE users SET status = 'suspended', is_active = false, updated_at = NOW() WHERE id = $1", [userId]);
  await run('DELETE FROM sessions WHERE user_id = $1', [userId]);
  return { success: updated > 0 };
}
