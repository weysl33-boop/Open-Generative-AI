import { getMigrationStatus, runMigrations } from '../lib/db/migrations.js';

try {
  const changes = await runMigrations();
  const status = await getMigrationStatus();
  console.log(JSON.stringify({ ok: status.ok, changes, latest: status.latest }, null, 2));
} catch (error) {
  console.error('[migrate] PostgreSQL migration failed:', error.message);
  process.exitCode = 1;
}
