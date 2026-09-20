import crypto from 'node:crypto';
import { execute, queryOne } from '../lib/db/index.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';

try {
  // Mints a 30-day super_admin session, so it must never reach the live database
  // by accident.
  await assertSandboxDatabase();
  const admin = await queryOne("SELECT id, email FROM users WHERE role = 'super_admin' LIMIT 1");
  if (!admin) throw new Error('未找到 super_admin 用户');
  const rawToken = crypto.randomBytes(32).toString('base64url');
  await execute('INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [crypto.createHash('sha256').update(rawToken).digest('hex'), admin.id, new Date(Date.now() + 30 * 86400000).toISOString(), new Date().toISOString()]);
  console.log('SESSION_TOKEN:' + rawToken);
  console.log('ADMIN_EMAIL:' + admin.email);
} catch (error) {
  console.error('[create-admin-session] failed:', error.message);
  process.exitCode = 1;
}
