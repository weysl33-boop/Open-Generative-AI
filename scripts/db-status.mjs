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

const { healthCheck } = await import('../lib/db/connection.js');
const { getMigrationStatus } = await import('../lib/db/migrations.js');

try {
  const [database, migrations] = await Promise.all([healthCheck(), getMigrationStatus()]);
  console.log(JSON.stringify({ database, migrations }, null, 2));
  if (!database.ok || !migrations.ok) process.exitCode = 1;
} catch (error) {
  console.error('[db-status] PostgreSQL unavailable:', error.message);
  process.exitCode = 1;
}
