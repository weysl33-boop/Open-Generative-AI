import fs from 'node:fs';
import { createRequire } from 'node:module';

// Same Node-only stub as scripts/migrate.mjs: `server-only` must not abort a
// maintenance script that legitimately runs outside the Next bundler.
const require = createRequire(import.meta.url);
try {
  const serverOnlyPath = require.resolve('server-only');
  require.cache[serverOnlyPath] = { id: serverOnlyPath, filename: serverOnlyPath, loaded: true, exports: {} };
} catch {}

try {
  if (typeof process.loadEnvFile === 'function') {
    if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
    else if (fs.existsSync('/etc/koyosim.env')) process.loadEnvFile('/etc/koyosim.env');
  }
} catch {}

const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required for production migration.');
}
const parsed = new URL(databaseUrl);
if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
}
process.env.DATABASE_URL = databaseUrl;

console.log('[prod-migration] Target Database:', databaseUrl.replace(/:[^:@]+@/, ':****@'));

const { runMigrations, getMigrationStatus } = await import('../lib/db/migrations.js');
const { assertSandboxDatabase } = await import('./require-sandbox-db.mjs');

// "Safe" here means the operator stated prod intent twice: this script is the
// deliberate production path, so it refuses to run on an unacknowledged target.
await assertSandboxDatabase();

// Run migrations. Checksum drift is deliberately not repaired here: the shared
// migration runner must refuse to continue until an operator reviews it.
console.log('[prod-migration] Running migrations...');
const changes = await runMigrations();
console.log('[prod-migration] Result:', JSON.stringify(changes, null, 2));

// 3. Status check
const status = await getMigrationStatus();
console.log('[prod-migration] Final Status:', {
  ok: status.ok,
  appliedCount: status.applied.length,
  pendingCount: status.pending.length,
  driftedCount: status.drifted.length,
  latest: status.latest,
});
