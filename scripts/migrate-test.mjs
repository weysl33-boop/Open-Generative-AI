import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = {
    id: serverOnlyPath,
    filename: serverOnlyPath,
    loaded: true,
    exports: {},
  };
} catch {}

try {
  if (typeof process.loadEnvFile === 'function' && fs.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const { requireIsolatedTestDatabase } = await import('./test-database-guard.mjs');
const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL, 'TEST_DATABASE_URL');
process.env.DATABASE_URL = testUrl;
const { getMigrationStatus, runMigrations } = await import('../lib/db/migrations.js');
const changes = await runMigrations();
const status = await getMigrationStatus();
console.log(JSON.stringify({ ok: status.ok, changes, latest: status.latest }, null, 2));
if (!status.ok) process.exitCode = 1;

