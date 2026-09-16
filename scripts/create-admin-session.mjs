import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const db = new DatabaseSync('data/billing.db');
const rawToken = crypto.randomBytes(32).toString('base64url');
const hash = crypto.createHash('sha256').update(rawToken).digest('hex');
const admin = db.prepare("SELECT id, email FROM users WHERE role = 'super_admin' LIMIT 1").get();
if (!admin) {
  console.error('未找到 super_admin 用户');
  process.exit(1);
}
const expires = new Date(Date.now() + 30 * 86400000).toISOString();
db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)")
  .run(hash, admin.id, expires, new Date().toISOString());

console.log('SESSION_TOKEN:' + rawToken);
console.log('ADMIN_EMAIL:' + admin.email);
