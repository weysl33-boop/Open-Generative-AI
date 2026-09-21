import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { requireIsolatedTestDatabase } from './test-database-guard.mjs';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL, 'TEST_DATABASE_URL');
const { Pool } = pg;
const pool = new Pool({ connectionString: testUrl });
const suffix = crypto.randomBytes(8).toString('hex');
const userId = `e2e_user_${suffix}`;
const adminId = `e2e_admin_${suffix}`;
const userToken = `e2e_user_token_${suffix}`;
const adminToken = `e2e_admin_token_${suffix}`;
const hash = (value) => crypto.createHash('sha256').update(value).digest('hex');
const expires = new Date(Date.now() + 3_600_000).toISOString();
try {
  const modelId = `e2e_mock_model_${suffix}`;
  await pool.query('INSERT INTO auth_usr.users (id, email, password_hash, password_salt, role, status, credits) VALUES ($1, $2, $3, $4, \'user\', \'active\', 10), ($5, $6, $7, $8, \'operations_admin\', \'active\', 0)', [userId, `${userId}@example.test`, 'fixture', 'fixture', adminId, `${adminId}@example.test`, 'fixture', 'fixture']);
  await pool.query('INSERT INTO ai_studio.models_config (id, provider, name, type, credits_price, is_active) VALUES ($1, \'mock\', \'P7 E2E Mock\', \'image\', 1, TRUE)', [modelId]);
  await pool.query('INSERT INTO auth_usr.sessions (token_hash, user_id, expires_at, created_at) VALUES ($1, $2, $3, now()), ($4, $5, $3, now())', [hash(userToken), userId, expires, hash(adminToken), adminId]);
  const file = process.env.E2E_SESSION_FILE || path.join('e2e', '.sessions.json');
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify({ userId, adminId, modelId, userToken, adminToken }, null, 2), 'utf8');
  console.log(`E2E fixtures seeded in test database: ${userId}, ${adminId}`);
} finally {
  await pool.end();
}
