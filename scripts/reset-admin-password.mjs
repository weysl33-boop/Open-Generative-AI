import crypto from 'node:crypto';
import { execute, queryOne } from '../lib/db/index.js';
import { setUserPassword } from '../lib/repositories/auth.js';

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(password, salt, 64).toString('hex') };
}

const password = process.env.ADMIN_RESET_PASSWORD;
const email = String(process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
if (!password || password.length < 12 || !email) {
  console.error('用法：ADMIN_EMAIL=admin@example.com ADMIN_RESET_PASSWORD=<临时密码> node scripts/reset-admin-password.mjs');
  process.exitCode = 2;
} else {
  try {
    const existing = await queryOne('SELECT id FROM users WHERE LOWER(email) = $1', [email]);
    if (!existing) throw new Error('未找到用户: ' + email);
    const { salt, hash } = passwordHash(password);
    await execute("UPDATE users SET role = 'super_admin', status = 'active', is_active = TRUE, is_banned = FALSE, updated_at = $1 WHERE id = $2", [new Date().toISOString(), existing.id]);
    await setUserPassword({ userId: existing.id, passwordHash: hash, passwordSalt: salt });
    await execute('DELETE FROM sessions WHERE user_id = $1', [existing.id]);
    console.log('[成功] 已在 PostgreSQL 中重置 ' + email + ' 的管理员密码并作废旧会话。');
  } catch (error) {
    console.error('[reset-admin-password] failed:', error.message);
    process.exitCode = 1;
  }
}
