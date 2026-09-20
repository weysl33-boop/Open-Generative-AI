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

const { getMigrationStatus, runMigrations } = await import('../lib/db/migrations.js');
const { assertSandboxDatabase } = await import('./require-sandbox-db.mjs');

try {
  await assertSandboxDatabase();
  const changes = await runMigrations();
  const status = await getMigrationStatus();
  console.log(JSON.stringify({ ok: status.ok, changes, latest: status.latest }, null, 2));
} catch (error) {
  console.error('[migrate] PostgreSQL migration failed:', error.message);
  if (error.cause) console.error('[migrate cause]:', error.cause);
  process.exitCode = 1;
}
