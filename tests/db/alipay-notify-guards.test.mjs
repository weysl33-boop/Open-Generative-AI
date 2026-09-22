import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const { reserveTestUserId } = await import('../../scripts/test-user-id-fixtures.mjs');
const { createOrder } = await import('../../lib/services/billing.js');
const { dispatchPaymentWebhook } = await import('../../lib/services/webhookDispatcher.js');
const { syncOrderPaymentStatus } = await import('../../lib/services/paymentService.js');
const { findCreditPackById } = await import('../../lib/payments/creditPacks.js');

test.after(async () => {
  await db.closePgPool();
});

async function seedUser() {
  const userId = await reserveTestUserId((sql, params) => db.query(sql, params));
  await db.execute(
    `INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
     VALUES ($1, $2, 'hash', 'salt', 'user', 0, 'active')`,
    [userId, `${userId}@example.test`],
  );
  return userId;
}

async function newCreditPackOrder({ userId, idempotencyKey }) {
  const pack = findCreditPackById('credit_490');
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
  return { pack, order: created.order };
}

async function payoutSnapshot(orderId) {
  const ledger = await db.queryOne(
    'SELECT count(*) AS rows FROM payment_ledger WHERE order_id = $1',
    [orderId],
  );
  const grant = await db.queryOne(
    `SELECT count(*) AS rows FROM credit_ledger_v2 WHERE idempotency_key = $1`,
    [`payment:${orderId}:credits`],
  );
  const wallet = await db.queryOne(
    'SELECT perpetual_credits FROM credit_wallets WHERE user_id = (SELECT user_id FROM orders WHERE id = $1)',
    [orderId],
  );
  return {
    ledgerRows: Number(ledger.rows),
    grantRows: Number(grant.rows),
    credits: wallet ? Number(wallet.perpetual_credits) : 0,
  };
}

// 「报文结构完全合法、金额对不上」是第十五阶段第 9 项（0.01 元买高价值套餐）在真库上的形态：
// 验签发生在路由、履约发生在这一层，所以这一层必须自己把金额钉住，不能假设上游已经查过。
test('alipay notification with a mismatched amount is refused and leaves the order payable', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = await seedUser();
  const { pack, order } = await newCreditPackOrder({ userId, idempotencyKey: `amount-mismatch-${suffix}` });
  const orderId = order.id;

  try {
    const forged = await dispatchPaymentWebhook({
      provider: 'alipay',
      event: {
        id: `alipay_forged_${suffix}`,
        kind: 'payment',
        type: 'TRADE_SUCCESS',
        out_trade_no: orderId,
        trade_no: `trade_forged_${suffix}`,
        amount_total: 1,
        currency: 'CNY',
      },
    });
    assert.equal(forged.success, false);
    assert.equal(forged.retryable, false);
    assert.equal(forged.action, 'payment_amount_mismatch');
    assert.match(String(forged.error), /^amount_total_mismatch:/);
    assert.deepEqual(await payoutSnapshot(orderId), { ledgerRows: 0, grantRows: 0, credits: 0 });
    assert.equal((await db.queryOne('SELECT status FROM orders WHERE id = $1', [orderId])).status, 'pending');

    // 一次被拒的到账通知不能把订单打成死单：真钱随后到达时仍要恰好履约一次。
    const genuine = await dispatchPaymentWebhook({
      provider: 'alipay',
      event: {
        id: `alipay_${suffix}`,
        kind: 'payment',
        type: 'TRADE_SUCCESS',
        out_trade_no: orderId,
        trade_no: `trade_${suffix}`,
        amount_total: pack.priceCny * 100,
        currency: 'CNY',
      },
    });
    assert.equal(genuine.success, true);
    assert.deepEqual(await payoutSnapshot(orderId), { ledgerRows: 1, grantRows: 1, credits: pack.credits });

    // 轮询与刷新页面读的是同一个服务端真值：订单已 PAID 就不再是 PENDING。
    const polled = await syncOrderPaymentStatus(orderId, userId);
    assert.equal(polled.status, 'paid');
    assert.equal(polled.orderId, orderId);
    assert.ok(polled.paidAt);

    const wrongWalletOwner = await syncOrderPaymentStatus(orderId, `usr_not_${suffix}`);
    assert.equal(wrongWalletOwner.status, 403);
  } finally {
    await db.execute('DELETE FROM payment_ledger WHERE order_id = $1', [orderId]).catch(() => {});
    await db.execute('DELETE FROM webhook_events WHERE provider = $1 AND event_id = ANY($2)', ['alipay', [`alipay_forged_${suffix}`, `alipay_${suffix}`]]).catch(() => {});
    await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM credit_wallets WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM orders WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
});

// 过期后点「重新生成支付二维码」必须是另一笔交易：新订单号、新 out_trade_no，
// 旧订单不会因为新订单的到账通知而被顺带核销。
test('regenerating an expired QR opens a separate trade order', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const userId = await seedUser();
  const stale = await newCreditPackOrder({ userId, idempotencyKey: `stale-${suffix}` });
  const fresh = await newCreditPackOrder({ userId, idempotencyKey: `fresh-${suffix}` });
  const orderIds = [stale.order.id, fresh.order.id];

  try {
    assert.notEqual(stale.order.id, fresh.order.id);
    await db.execute(`UPDATE orders SET status = 'expired' WHERE id = $1`, [stale.order.id]);

    const paid = await dispatchPaymentWebhook({
      provider: 'alipay',
      event: {
        id: `alipay_fresh_${suffix}`,
        kind: 'payment',
        type: 'TRADE_SUCCESS',
        out_trade_no: fresh.order.id,
        trade_no: `trade_fresh_${suffix}`,
        amount_total: fresh.pack.priceCny * 100,
        currency: 'CNY',
      },
    });
    assert.equal(paid.success, true);

    const statusOf = async (orderId) => (await db.queryOne('SELECT status FROM orders WHERE id = $1', [orderId])).status;
    assert.equal(await statusOf(fresh.order.id), 'paid');
    assert.equal(await statusOf(stale.order.id), 'expired');
    assert.equal((await payoutSnapshot(fresh.order.id)).credits, fresh.pack.credits);
    // 旧订单既没有台账也没有流水，用户余额里只有新那一笔的钱。
    assert.deepEqual(
      { ledgerRows: (await payoutSnapshot(stale.order.id)).ledgerRows, grantRows: (await payoutSnapshot(stale.order.id)).grantRows },
      { ledgerRows: 0, grantRows: 0 },
    );
  } finally {
    for (const orderId of orderIds) {
      await db.execute('DELETE FROM payment_ledger WHERE order_id = $1', [orderId]).catch(() => {});
    }
    await db.execute('DELETE FROM webhook_events WHERE provider = $1 AND event_id = $2', ['alipay', `alipay_fresh_${suffix}`]).catch(() => {});
    await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM credit_wallets WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM orders WHERE user_id = $1', [userId]).catch(() => {});
    await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
  }
});

// 通知先于本地订单落库（或 out_trade_no 被乱填）时必须要求重推，绝不能凭空造额度。
test('alipay notification for an unknown order asks for retry without granting', { skip: !testUrl }, async () => {
  const suffix = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  const missingOrderId = `ko_missing_${suffix}`;
  let outcome = null;

  try {
    outcome = await dispatchPaymentWebhook({
      provider: 'alipay',
      event: {
        id: `alipay_missing_${suffix}`,
        kind: 'payment',
        type: 'TRADE_SUCCESS',
        out_trade_no: missingOrderId,
        trade_no: `trade_missing_${suffix}`,
        amount_total: 4900,
        currency: 'CNY',
      },
    });
    assert.equal(outcome.success, false);
    assert.equal(outcome.retryable, true);
    assert.equal(outcome.action, 'payment_waiting_for_order');
    const ledger = await db.queryOne('SELECT count(*) AS rows FROM payment_ledger WHERE order_id = $1', [missingOrderId]);
    assert.equal(Number(ledger.rows), 0);
  } finally {
    await db.execute('DELETE FROM webhook_events WHERE provider = $1 AND event_id = $2', ['alipay', `alipay_missing_${suffix}`]).catch(() => {});
  }
});
