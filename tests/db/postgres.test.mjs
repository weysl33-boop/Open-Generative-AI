import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');

test('PostgreSQL test environment is explicit and migrations are converged', { skip: !testUrl }, async () => {
  await migrations.runMigrations();
  const status = await migrations.getMigrationStatus();
  assert.equal(status.ok, true);
  assert.equal(status.pending.length, 0);
  assert.equal(status.drifted.length, 0);
  assert.match(status.latest, /^006_/);
});

test('query, queryOne and execute use PostgreSQL parameter binding', { skip: !testUrl }, async () => {
  const row = await db.queryOne('SELECT $1::text AS value', ['bound']);
  assert.equal(row.value, 'bound');
  assert.equal(await db.execute('SELECT $1::text AS value', ['executed']), 1);
});

test('transaction rollback leaves no test row behind', { skip: !testUrl }, async () => {
  const id = `test_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await assert.rejects(() => db.withTransaction(async (tx) => {
    await tx.execute('INSERT INTO users (id, email, password_hash, password_salt) VALUES ($1, $2, $3, $4)', [id, `${id}@example.test`, 'hash', 'salt']);
    throw new Error('intentional rollback');
  }), /transaction failed/i);
  assert.equal(await db.queryOne('SELECT id FROM users WHERE id = $1', [id]), null);
});

test('idempotency duplicate request is rejected by the database constraint', { skip: !testUrl }, async () => {
  const id = `test_idem_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const values = [id, 'test', 'test-actor', 'processing', new Date().toISOString(), new Date(Date.now() + 60_000).toISOString()];
  await db.execute('INSERT INTO idempotency_keys (key_hash, scope, actor_id, status, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)', values);
  await assert.rejects(() => db.execute('INSERT INTO idempotency_keys (key_hash, scope, actor_id, status, created_at, expires_at) VALUES ($1, $2, $3, $4, $5, $6)', values), /duplicate key|unique constraint/i);
  await db.execute('DELETE FROM idempotency_keys WHERE key_hash = $1', [id]);
});
