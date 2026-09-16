import { healthCheck } from '../lib/db/connection.js';
import { getMigrationStatus } from '../lib/db/migrations.js';

try {
  const [database, migrations] = await Promise.all([healthCheck(), getMigrationStatus()]);
  console.log(JSON.stringify({ database, migrations }, null, 2));
  if (!database.ok || !migrations.ok) process.exitCode = 1;
} catch (error) {
  console.error('[db-status] PostgreSQL unavailable:', error.message);
  process.exitCode = 1;
}
