import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

function passwordHash(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash: derived };
}

function nowIso() {
  return new Date().toISOString();
}

function randomId(prefix = 'usr') {
  return `${prefix}_${crypto.randomBytes(16).toString('hex')}`;
}

const db = new DatabaseSync('data/billing.db');

const accounts = [
  { email: 'admin@koyosim.com', password: 'KoyoSIM@Admin2026!', role: 'super_admin' },
  { email: 'support@koyosim.com', password: 'KoyoSIM@Admin2026!', role: 'super_admin' }
];

console.log('=== 正在配置管理员账户及密码 ===');

for (const acc of accounts) {
  const existing = db.prepare('SELECT id, email, role FROM users WHERE email = ?').get(acc.email);
  const { salt, hash } = passwordHash(acc.password);
  const now = nowIso();

  if (existing) {
    db.prepare(`
      UPDATE users 
      SET password_hash = ?, password_salt = ?, role = ?, status = 'active', updated_at = ?
      WHERE id = ?
    `).run(hash, salt, acc.role, now, existing.id);
    console.log(`[更新成功] 账户: ${acc.email} (ID: ${existing.id}), 角色: ${acc.role}`);
  } else {
    const id = randomId('usr');
    db.prepare(`
      INSERT INTO users (id, email, password_hash, password_salt, role, credits, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
    `).run(id, acc.email, hash, salt, acc.role, 10000, now, now);
    console.log(`[创建成功] 账户: ${acc.email} (ID: ${id}), 角色: ${acc.role}`);
  }
}

console.log('全部管理员账户与密码设置完成！');
