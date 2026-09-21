import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import pg from 'pg';
import { requireIsolatedTestDatabase } from './test-database-guard.mjs';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const file = process.env.E2E_SESSION_FILE || 'e2e/.sessions.json';
requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL, 'TEST_DATABASE_URL');
let fixture = null;
try { fixture = JSON.parse(await fs.readFile(file, 'utf8')); } catch { process.exit(0); }
const pool = new pg.Pool({ connectionString: testUrl });
try {
  const hashes = [fixture.userToken, fixture.adminToken].map((token) => crypto.createHash('sha256').update(token).digest('hex'));
  await pool.query('DELETE FROM auth_usr.sessions WHERE token_hash = ANY($1::text[])', [hashes]);
  await pool.query('DELETE FROM auth_usr.users WHERE id = ANY($1::text[])', [[fixture.userId, fixture.adminId]]);
  if (fixture.modelId) await pool.query('DELETE FROM ai_studio.models_config WHERE id = $1', [fixture.modelId]);
  await fs.rm(file, { force: true });
} finally { await pool.end(); }
