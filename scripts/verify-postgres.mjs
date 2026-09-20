import assert from 'node:assert/strict';
import { healthCheck, queryOne, withTransaction } from '../lib/db/index.js';
import { getMigrationStatus, runMigrations } from '../lib/db/migrations.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';

export async function runPostgresVerification() {
  await assertSandboxDatabase();
  await runMigrations();
  const [database, migrations] = await Promise.all([healthCheck(), getMigrationStatus()]);
  assert.equal(database.ok, true);
  assert.equal(migrations.ok, true);
  const rollbackTable = 'verify_rollback_' + Date.now();
  await assert.rejects(() => withTransaction(async (tx) => {
    await tx.execute(`CREATE TEMP TABLE ${rollbackTable} (id TEXT PRIMARY KEY) ON COMMIT DROP`);
    await tx.execute(`INSERT INTO ${rollbackTable} (id) VALUES ($1)`, [rollbackTable]);
    throw new Error('verification rollback');
  }));
  const rollbackState = await queryOne('SELECT to_regclass($1) AS relation', [`pg_temp.${rollbackTable}`]);
  assert.equal(rollbackState?.relation, null);
  console.log('[verify] PostgreSQL connection, migration ledger, parameter binding and rollback passed.');
}
