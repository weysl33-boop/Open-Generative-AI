import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const { createOrder, listPublicPlans } = await import('../../lib/services/billing.js');
const { dispatchPaymentWebhook } = await import('../../lib/services/webhookDispatcher.js');
const { findCreditPackById } = await import('../../lib/payments/creditPacks.js');

test.after(async () => {
  await db.closePgPool();
});

test('paid one-time credit-pack order is persisted, fulfilled once, and never creates a subscription', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = `credit_pack_user_${suffix}`;
  const idempotencyKey = `credit-pack-${suffix}`;
  const eventId = `alipay_credit_pack_${suffix}`;
  const pack = findCreditPackById('credit_490');
  let orderId = null;

  try {
    await db.execute(
      `INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
       VALUES ($1, $2, 'hash', 'salt', 'user', 0, 'active')`,
      [userId, `${userId}@example.test`],
    );

    const publishedPlans = await listPublicPlans();
    assert.deepEqual(
      publishedPlans.filter((item) => ['starter', 'basic', 'plus', 'pro'].includes(item.id)).map((item) => item.id).sort(),
      ['basic', 'plus', 'pro', 'starter'],
      'PostgreSQL public catalog must return enabled plans without boolean/integer operator errors',
    );
    const starter = publishedPlans.find((item) => item.id === 'starter');
    assert.deepEqual(starter.featureGroups?.video, [
      'Seedance 2.0/2.5 Pro / Fast / mini',
      '专享异步并发通道：10 路',
      '单模型并发：5 路',
    ], 'the public catalog must preserve the screenshot-defined video feature grouping');
    assert.deepEqual(starter.featureGroups?.image, [
      'Flova Image 2.5 Sunburst / Flare',
      '全站模型限时低至 6 折',
    ]);
    assert.equal(starter.featureGroups?.more?.length, 4);

    const created = await createOrder({
      userId,
      provider: 'alipay',
      plan: pack,
      productType: 'credit_pack',
      productId: pack.id,
      amountMinor: pack.priceCny * 100,
      currency: 'CNY',
      idempotencyKey,
      billingCycle: 'one_time',
      creditAmount: pack.credits,
    });
    orderId = created.order.id;
    assert.equal(created.order.status, 'pending');
    assert.equal(created.order.billing_cycle, 'one_time');
    assert.deepEqual(created.order.metadata_json, {
      planId: pack.id,
      productId: pack.id,
      productType: 'credit_pack',
      billingCycle: 'one_time',
      creditAmount: pack.credits,
    });

    const replay = await createOrder({
      userId,
      provider: 'alipay',
      plan: pack,
      productType: 'credit_pack',
      productId: pack.id,
      amountMinor: pack.priceCny * 100,
      currency: 'CNY',
      idempotencyKey,
      billingCycle: 'one_time',
      creditAmount: pack.credits,
    });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.order.id, orderId);

    const fulfilled = await dispatchPaymentWebhook({
      provider: 'alipay',
      event: {
        id: eventId,
        kind: 'payment',
        type: 'TRADE_SUCCESS',
        out_trade_no: orderId,
        trade_no: `trade_${suffix}`,
        amount_total: pack.priceCny * 100,
        currency: 'CNY',
      },
    });
    assert.equal(fulfilled.success, true);

    const order = await db.queryOne('SELECT status, amount_minor, currency FROM orders WHERE id = $1', [orderId]);
    assert.deepEqual({ status: order.status, amount: Number(order.amount_minor), currency: order.currency }, {
      status: 'paid', amount: pack.priceCny * 100, currency: 'CNY',
    });
    const wallet = await db.queryOne('SELECT perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId]);
    assert.equal(Number(wallet.perpetual_credits), pack.credits);
    const grant = await db.queryOne(
      `SELECT delta, action_type FROM credit_ledger_v2
       WHERE user_id = $1 AND idempotency_key = $2`,
      [userId, `payment:${orderId}:credits`],
    );
    assert.deepEqual({ delta: Number(grant.delta), action: grant.action_type }, { delta: pack.credits, action: 'CREDIT_GRANT' });
    assert.equal(Number((await db.queryOne('SELECT count(*) AS count FROM subscriptions WHERE user_id = $1', [userId])).count), 0);
    assert.equal(Number((await db.queryOne('SELECT count(*) AS count FROM payment_ledger WHERE order_id = $1', [orderId])).count), 1);

    const duplicate = await dispatchPaymentWebhook({
      provider: 'alipay',
      event: {
        id: eventId,
        kind: 'payment',
        type: 'TRADE_SUCCESS',
        out_trade_no: orderId,
        trade_no: `trade_${suffix}`,
        amount_total: pack.priceCny * 100,
        currency: 'CNY',
      },
    });
    assert.equal(duplicate.duplicate, true);
    assert.equal(Number((await db.queryOne('SELECT perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId])).perpetual_credits), pack.credits);
  } finally {
    if (orderId) {
      await db.execute('DELETE FROM payment_ledger WHERE order_id = $1', [orderId]).catch(() => {});
      await db.execute('DELETE FROM orders WHERE id = $1', [orderId]).catch(() => {});
    }
    await db.execute('DELETE FROM webhook_events WHERE provider = $1 AND event_id = $2', ['alipay', eventId]).catch(() => {});
    await db.execute('DELETE FROM subscriptions WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM credit_wallets WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
});
