import { execute, queryOne } from '../lib/db/index.js';

const email = String(process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('用法：node scripts/bootstrap-admin.mjs <已注册用户邮箱>');
  process.exitCode = 2;
} else {
  try {
    const user = await queryOne('SELECT id, email, role, status FROM users WHERE email = $1', [email]);
    if (!user) throw new Error('未找到邮箱为 [' + email + '] 的用户，请先在前台注册。');
    const now = new Date().toISOString();
    await execute("UPDATE users SET role = 'super_admin', status = 'active', is_active = TRUE, is_banned = FALSE, updated_at = $1 WHERE id = $2", [now, user.id]);
    const revoked = await execute('DELETE FROM sessions WHERE user_id = $1', [user.id]);
    console.log('[成功] 已将用户 [' + email + '] 提升为超级管理员。已作废 ' + revoked + ' 个历史会话。');
  } catch (error) {
    console.error('[bootstrap-admin] failed:', error.message);
    process.exitCode = 1;
  }
}
