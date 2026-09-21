import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const { reserveTestUserId } = await import('../../scripts/test-user-id-fixtures.mjs');

test.after(async () => {
  await db.closePgPool();
});

test('PostgreSQL test environment is explicit and migrations are converged', { skip: !testUrl }, async () => {
  await migrations.runMigrations();
  const status = await migrations.getMigrationStatus();
  assert.equal(status.ok, true);
  assert.equal(status.pending.length, 0);
  assert.equal(status.drifted.length, 0);
  assert.match(status.latest, /^\d{3}_/);
});

test('query, queryOne and execute use PostgreSQL parameter binding', { skip: !testUrl }, async () => {
  const row = await db.queryOne('SELECT $1::text AS value', ['bound']);
  assert.equal(row.value, 'bound');
  assert.equal(await db.execute('SELECT $1::text AS value', ['executed']), 1);
});

test('transaction rollback leaves no test row behind', { skip: !testUrl }, async () => {
  let id;
  await assert.rejects(() => db.withTransaction(async (tx) => {
    id = await reserveTestUserId((sql, params) => tx.query(sql, params));
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

test('simulated generation settles once and releases once on provider failure', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = await reserveTestUserId((sql, params) => db.query(sql, params));
  const modelId = `p3_mock_${suffix}`;
  const key = `p3_generation_${suffix}`;
  const failureKey = `${key}_failure`;

  const { grantPerpetualCredits } = await import('../../lib/financial/creditService.js');
  const { createGenerationTask, processGenerationTask } = await import('../../lib/services/generationCore.js');
  const { createMockGenerationProvider } = await import('../../lib/services/generationProviders.js');

  try {
    await db.execute(`INSERT INTO users (id, email, password_hash, password_salt, role, credits, status) VALUES ($1, $2, 'hash', 'salt', 'user', 0, 'active')`, [userId, `${userId}@example.test`]);
    await db.execute(`INSERT INTO models_config (id, provider, name, type, credits_price, is_active) VALUES ($1, 'mock', 'P3 Mock', 'image', 3, TRUE)`, [modelId]);
    await grantPerpetualCredits(userId, 10, 'P3 integration seed', userId, `p3:seed:${userId}`);

    const task = await createGenerationTask({ userId, modelId, prompt: 'test prompt', parameters: { aspect_ratio: '1:1' }, idempotencyKey: key });
    const duplicate = await createGenerationTask({ userId, modelId, prompt: 'test prompt', parameters: { aspect_ratio: '1:1' }, idempotencyKey: key });
    assert.equal(duplicate.creation.id, task.creation.id);
    assert.equal(duplicate.idempotent, true);

    const succeeded = await processGenerationTask({
      creationId: task.creation.id,
      providerClient: createMockGenerationProvider({ resultUrl: 'https://mock.invalid/p3-success.png' }),
    });
    assert.equal(succeeded.success, true);
    const repeated = await processGenerationTask({
      creationId: task.creation.id,
      providerClient: createMockGenerationProvider({ outcome: 'failed' }),
    });
    assert.equal(repeated.idempotent, true);

    const failureTask = await createGenerationTask({ userId, modelId, prompt: 'failure', idempotencyKey: failureKey });
    const failed = await processGenerationTask({
      creationId: failureTask.creation.id,
      providerClient: createMockGenerationProvider({ outcome: 'failed' }),
    });
    assert.equal(failed.success, false);

    const rows = await db.query(`SELECT c.status, r.status AS reservation_status FROM creations c JOIN credit_reservations r ON r.id = c.reservation_id WHERE c.id = ANY($1::text[])`, [[task.creation.id, failureTask.creation.id]]);
    assert.deepEqual(rows.rows.map((row) => [row.status, row.reservation_status]).sort(), [['failed', 'VOIDED'], ['succeeded', 'COMMITTED']]);
    const ledger = await db.query(`SELECT action_type FROM credit_ledger_v2 WHERE user_id = $1 AND action_type IN ('TASK_RESERVE', 'TASK_COMMIT', 'TASK_RELEASE')`, [userId]);
    assert.ok(ledger.rows.some((row) => row.action_type === 'TASK_RESERVE'));
    assert.ok(ledger.rows.some((row) => row.action_type === 'TASK_COMMIT'));
    assert.ok(ledger.rows.some((row) => row.action_type === 'TASK_RELEASE'));
  } finally {
    await db.execute('DELETE FROM credit_reservations WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM creations WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM models_config WHERE id = $1', [modelId]).catch(() => {});
  }
});

test('payment credit refunds reverse a grant once and preserve non-negative balances', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = await reserveTestUserId((sql, params) => db.query(sql, params));
  const referenceId = `refund_order_${suffix}`;
  const idempotencyKey = `refund_credits_${suffix}`;
  const { grantPerpetualCredits, reversePaymentCredits } = await import('../../lib/financial/creditService.js');

  try {
    await db.execute(`INSERT INTO users (id, email, password_hash, password_salt, role, credits, status) VALUES ($1, $2, 'hash', 'salt', 'user', 0, 'active')`, [userId, `${userId}@example.test`]);
    await grantPerpetualCredits(userId, 10, 'payment grant test', referenceId, `grant:${idempotencyKey}`);
    const reversed = await reversePaymentCredits({ userId, referenceId, idempotencyKey });
    assert.equal(reversed.reversedAmount, 10);
    assert.equal(reversed.unrecoveredAmount, 0);
    const repeated = await reversePaymentCredits({ userId, referenceId, idempotencyKey });
    assert.equal(repeated.idempotent, true);
    const wallet = await db.queryOne('SELECT perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId]);
    assert.equal(Number(wallet.perpetual_credits), 0);
    const ledger = await db.queryOne(`SELECT delta, action_type FROM credit_ledger_v2 WHERE user_id = $1 AND idempotency_key = $2`, [userId, idempotencyKey]);
    assert.deepEqual({ delta: Number(ledger.delta), action_type: ledger.action_type }, { delta: -10, action_type: 'PAYMENT_REFUND' });
  } finally {
    await db.execute('DELETE FROM credit_refund_obligations WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
});
