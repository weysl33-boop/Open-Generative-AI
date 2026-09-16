import assert from 'node:assert/strict';
import { healthCheck, queryOne, withTransaction } from '../lib/db/index.js';
import { getMigrationStatus, runMigrations } from '../lib/db/migrations.js';

export async function runPostgresVerification() {
  await runMigrations();
  const [database, migrations] = await Promise.all([healthCheck(), getMigrationStatus()]);
  assert.equal(database.ok, true);
  assert.equal(migrations.ok, true);
  const rollbackId = 'verify_rollback_' + Date.now();
  await assert.rejects(() => withTransaction(async (tx) => {
    await tx.execute('SELECT $1::text AS verification', [rollbackId]);
    throw new Error('verification rollback');
  }));
  assert.equal(await queryOne('SELECT $1::text AS verification', [rollbackId]).then((row) => row.verification), rollbackId);
  console.log('[verify] PostgreSQL connection, migration ledger, parameter binding and rollback passed.');
}
