import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const email = String(process.env.ADMIN_EMAIL || process.argv[2] || '').trim().toLowerCase();
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('用法：node scripts/bootstrap-admin.mjs <已注册用户邮箱>');
  console.error('示例：node scripts/bootstrap-admin.mjs admin@koyosim.com');
  process.exit(2);
}

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'billing.db');
const dbPath = process.env.BILLING_DB_PATH || DEFAULT_DB_PATH;

if (!fs.existsSync(dbPath)) {
  console.error(`数据库不存在: ${dbPath}，请先启动服务或运行 node scripts/migrate.mjs 完成初始化。`);
  process.exit(1);
}

const db = new DatabaseSync(dbPath);
const user = db.prepare('SELECT id, email, role, status FROM users WHERE email = ?').get(email);

if (!user) {
  console.error(`未找到邮箱为 [${email}] 的用户。出于安全考量，本命令不自动生成随机密码，请先在前台 /account 注册该邮箱后再执行本命令提权。`);
  process.exit(1);
}

db.prepare(`
  UPDATE users
  SET role = 'super_admin', status = 'active', updated_at = ?
  WHERE id = ?
`).run(new Date().toISOString(), user.id);

// 撤销该用户旧会话，强制重新登录
const revoked = db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

console.log(`========================================`);
console.log(`[成功] 已将用户 [${email}] 提升为超级管理员 (super_admin)！`);
console.log(`用户 ID: ${user.id}`);
console.log(`已安全作废 ${revoked.changes || 0} 个历史会话凭证。`);
console.log(`请使用原密码重新登录：https://go.koyosim.com/account?next=/admin`);
console.log(`========================================`);
