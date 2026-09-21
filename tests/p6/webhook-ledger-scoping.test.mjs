import test from 'node:test';
import assert from 'node:assert/strict';
import {
  claimWebhookEvent,
  createStripeRenewalOrderInTransaction,
  getWebhookEventForUpdate,
  markWebhookFailed,
  markWebhookProcessed,
  markWebhookReceived,
  markWebhookReplay,
  recordPaymentRefund,
  recordPaymentSuccess,
} from '../../lib/repositories/webhooks.js';

/**
 * 捕获 SQL 与绑定参数，用于校验渠道参数化后的占位符编号没有错位。
 */
function recordingTx(captured = []) {
  return {
    captured,
    queryOne: async (sql, params) => {
      captured.push({ sql, params });
      return { id: 'row_1', event_id: 'evt_1' };
    },
    execute: async (sql, params) => {
      captured.push({ sql, params });
      return 1;
    },
  };
}

function assertPlaceholdersBound({ sql, params }, label) {
  const used = [...sql.matchAll(/\$(\d+)/g)].map((m) => Number(m[1]));
  assert.ok(used.length > 0, `${label}: 语句中没有占位符`);
  const max = Math.max(...used);
  assert.equal(max, params.length, `${label}: 最大占位符 $${max} 与 ${params.length} 个参数不一致`);
  for (let n = 1; n <= max; n += 1) {
    assert.ok(used.includes(n), `${label}: 占位符 $${n} 未被使用，参数可能存在错位`);
  }
}

const BASE_ORDER = { id: 'KO_order_1', user_id: 'u_1' };

test('payment ledger entries are attributed to the notifying channel', async () => {
  const captured = [];
  const tx = recordingTx(captured);

  await recordPaymentSuccess({ provider: 'wechat', eventId: 'wx_txn_1', order: BASE_ORDER, userId: 'u_1', amountMinor: 2900, currency: 'CNY', providerPaymentId: 'txn_1', payload: { a: 1 }, transaction: tx });
  assertPlaceholdersBound(captured[0], 'recordPaymentSuccess');
  assert.equal(captured[0].params[1], 'wechat', 'payment_ledger.provider 必须记录为 wechat');
  assert.equal(captured[0].params[8], 'wechat:wx_txn_1:payment_succeeded', '幂等键前缀必须随渠道变化');

  await recordPaymentRefund({ provider: 'alipay', eventId: 'alipay_tn_1', order: BASE_ORDER, paymentIntentId: 'tn_1', amountMinor: 2900, currency: 'CNY', payload: { a: 1 }, transaction: tx });
  assertPlaceholdersBound(captured[1], 'recordPaymentRefund');
  assert.equal(captured[1].params[1], 'alipay');
  assert.equal(captured[1].params[8], 'alipay:alipay_tn_1:payment_refund');
});

test('payment ledger still defaults to stripe', async () => {
  const captured = [];
  await recordPaymentSuccess({ eventId: 'evt_1', order: BASE_ORDER, userId: 'u_1', amountMinor: 5000, currency: 'USD', providerPaymentId: 'pi_1', payload: {}, transaction: recordingTx(captured) });
  assert.equal(captured[0].params[1], 'stripe');
  assert.equal(captured[0].params[8], 'stripe:evt_1:payment_succeeded');
});

test('webhook event ledger is keyed by the notifying channel', async () => {
  const captured = [];
  const tx = recordingTx(captured);

  await claimWebhookEvent({ provider: 'wechat', eventId: 'wx_txn_1', eventType: 'TRANSACTION.SUCCESS', payload: { a: 1 }, headers: { 'wechatpay-signature': 's' }, timestamp: '2026-09-20T00:00:00.000Z', transaction: tx });
  assertPlaceholdersBound(captured[0], 'claimWebhookEvent');
  assert.equal(captured[0].params[0], 'wechat', 'webhook_events.provider 必须记录为 wechat');
  assert.match(captured[0].sql, /ON CONFLICT \(provider, event_id\) DO NOTHING/, '去重必须按 (provider, event_id) 复合主键');

  await markWebhookProcessed('wx_txn_1', '2026-09-20T00:00:01.000Z', tx, 'wechat');
  assertPlaceholdersBound(captured[1], 'markWebhookProcessed');
  assert.deepEqual([captured[1].params[1], captured[1].params[2]], ['wechat', 'wx_txn_1']);

  await markWebhookFailed('alipay_tn_1', '订单不存在', '2026-09-20T00:01:00.000Z', tx, 'alipay');
  assertPlaceholdersBound(captured[2], 'markWebhookFailed');
  assert.deepEqual([captured[2].params[1], captured[2].params[3]], ['alipay', 'alipay_tn_1']);

  await markWebhookReceived('wx_txn_1', '2026-09-20T00:00:02.000Z', tx, 'wechat');
  assertPlaceholdersBound(captured[3], 'markWebhookReceived');
  assert.deepEqual([captured[3].params[1], captured[3].params[2]], ['wechat', 'wx_txn_1']);

  await getWebhookEventForUpdate('wx_txn_1', tx, 'wechat');
  assertPlaceholdersBound(captured[4], 'getWebhookEventForUpdate');
  assert.deepEqual([captured[4].params[0], captured[4].params[1]], ['wechat', 'wx_txn_1']);

  await markWebhookReplay({ eventId: 'wx_txn_1', status: 'replayed', replayedAt: '2026-09-20T00:00:03.000Z', lastError: null, transaction: tx, provider: 'wechat' });
  assertPlaceholdersBound(captured[5], 'markWebhookReplay');
  assert.equal(captured[5].params[3], 'wechat');
});

test('Stripe renewal orders preserve the original credit snapshot and deduplicate by invoice', async () => {
  const captured = [];
  const tx = recordingTx(captured);
  await createStripeRenewalOrderInTransaction({
    invoiceId: 'in_renewal_2',
    stripeSubscriptionId: 'sub_1',
    baseOrder: { id: 'order_initial', user_id: 'u_1', plan_id: 'starter' },
    amountMinor: 1400,
    currency: 'USD',
    creditAmount: 2400,
    providerPaymentId: 'pi_renewal_2',
    transaction: tx,
  });

  assertPlaceholdersBound(captured[0], 'createStripeRenewalOrderInTransaction');
  assert.match(captured[0].sql, /ON CONFLICT \(provider, idempotency_key\)/);
  assert.equal(captured[0].params[6], 'pi_renewal_2');
  assert.equal(captured[0].params[7], 'stripe-renewal:in_renewal_2');
  assert.deepEqual(JSON.parse(captured[0].params[8]), {
    planId: 'starter',
    billingCycle: 'monthly',
    creditAmount: 2400,
    stripeSubscriptionId: 'sub_1',
    invoiceId: 'in_renewal_2',
    baseOrderId: 'order_initial',
  });
});
