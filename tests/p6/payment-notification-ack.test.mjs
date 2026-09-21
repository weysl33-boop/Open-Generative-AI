import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import { paymentNotificationOutcome } from '../../lib/payments/provider.js';
import { reconcileAmount, reconcileRefundAmount, nativeEventKind } from '../../lib/services/webhookDispatcher.js';
import { getWechatProvider } from '../../lib/payments/wechatProvider.js';
import { getAlipayProvider } from '../../lib/payments/alipayProvider.js';

function capture(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}

test('P6 only acks a notification once fulfillment actually completed', () => {
  assert.equal(paymentNotificationOutcome({}), 'ack');
  assert.equal(paymentNotificationOutcome({ result: { success: true, action: 'payment_recorded' } }), 'ack');
  assert.equal(paymentNotificationOutcome({ result: { duplicate: true, action: 'duplicate_ignored' } }), 'ack');

  // 订单还没同步到位：回 ack 等于让厂商停止重推，这笔钱就再也对不上账。
  assert.equal(paymentNotificationOutcome({ result: { success: false, retryable: true, action: 'payment_waiting_for_order' } }), 'retry');
  // 报文缺订单号、金额对不上这类重推也不会变好的失败，应让厂商停手并把事件留在 failed。
  assert.equal(paymentNotificationOutcome({ result: { success: false, error: '缺少订单号 out_trade_no' } }), 'reject');
  assert.equal(paymentNotificationOutcome({ result: { success: false, action: 'payment_amount_mismatch' } }), 'reject');
  assert.equal(paymentNotificationOutcome({ error: Object.assign(new Error('db down'), { code: 'DATABASE_ERROR' }) }), 'retry');
  assert.equal(paymentNotificationOutcome({ error: new Error('unexpected') }), 'retry');
});

test('P6 verification failures are rejected instead of retried forever', () => {
  const forged = Object.assign(new Error('forged'), { code: 'WEBHOOK_SIGNATURE_INVALID' });
  const missingHeaders = Object.assign(new Error('no headers'), { code: 'WEBHOOK_HEADERS_MISSING' });
  assert.equal(paymentNotificationOutcome({ error: forged }), 'reject');
  assert.equal(paymentNotificationOutcome({ error: missingHeaders }), 'reject');
});

test('P6 native providers throw the codes the ack classifier relies on', () => {
  const wechat = getWechatProvider({ apiV3Key: '12345678901234567890123456789012', publicKey: '' });
  const wechatNoHeaders = capture(() => wechat.verifyWebhookSignature('{}', {}));
  assert.equal(wechatNoHeaders?.code, 'WEBHOOK_HEADERS_MISSING');

  const wechatUnsigned = capture(() =>
    wechat.verifyWebhookSignature('{"id":"wx_1"}', {
      'wechatpay-signature': 'forged',
      'wechatpay-timestamp': '1700000000',
      'wechatpay-nonce': 'nonce',
    })
  );
  assert.equal(wechatUnsigned?.code, 'WEBHOOK_SIGNATURE_INVALID');

  const alipay = getAlipayProvider({ appId: '2021000000000000', privateKey: 'x', publicKey: '' });
  const alipayUnsigned = capture(() =>
    alipay.verifyWebhookSignature({ out_trade_no: 'KO1', trade_status: 'TRADE_SUCCESS', sign: 'forged' })
  );
  assert.equal(alipayUnsigned?.code, 'WEBHOOK_SIGNATURE_INVALID');

  // 端到端：验签失败的报文必须落到 reject 分支，不能回肯定应答。
  for (const error of [wechatNoHeaders, wechatUnsigned, alipayUnsigned]) {
    assert.ok(error, '验签必须抛错而不是静默放行');
    assert.equal(paymentNotificationOutcome({ error }), 'reject');
  }
});

test('P6 fulfillment refuses to grant credits on an amount or currency mismatch', () => {
  const order = { amount_minor: 3990, currency: 'CNY' };
  const paid = reconcileAmount({ claimed: 3990, currency: 'CNY', order, field: 'amount_total' });
  assert.deepEqual(paid, { ok: true, amountMinor: 3990, currency: 'CNY' });

  // 少付一分也不能按订单原价放额度。
  assert.equal(reconcileAmount({ claimed: 3989, currency: 'CNY', order, field: 'amount_total' }).reason, 'amount_total_mismatch:3989!=3990');
  assert.equal(reconcileAmount({ claimed: 1, currency: 'CNY', order, field: 'amount_total' }).ok, false);
  // 厂商没报金额不等于金额正确。
  assert.equal(reconcileAmount({ claimed: undefined, currency: 'CNY', order, field: 'amount_total' }).reason, 'amount_total_missing');
  assert.equal(reconcileAmount({ claimed: 0, currency: 'CNY', order, field: 'amount_total' }).reason, 'amount_total_missing');
  // 币种不同的一元钱不是同一笔钱。
  assert.equal(reconcileAmount({ claimed: 3990, currency: 'USD', order, field: 'amount_total' }).reason, 'currency_mismatch:USD!=CNY');
  // 订单自身没有金额时宁可拒绝，也不能按 0 放行。
  assert.equal(reconcileAmount({ claimed: 3990, currency: 'CNY', order: { amount_minor: 0 }, field: 'amount_total' }).reason, 'order_amount_unavailable');
});

test('P6 refunds reverse credits only when they cover the whole order', () => {
  const order = { amount_minor: 3990, currency: 'CNY' };
  assert.deepEqual(reconcileRefundAmount({ claimed: 3990, currency: 'CNY', order }), { ok: true, amountMinor: 3990, fullyRefunded: true });
  // 部分退款只记账不回冲额度：额度是否收回必须留给人工判断。
  assert.deepEqual(reconcileRefundAmount({ claimed: 1000, currency: 'CNY', order }), { ok: true, amountMinor: 1000, fullyRefunded: false });
  assert.equal(reconcileRefundAmount({ claimed: 3991, currency: 'CNY', order }).reason, 'refund_exceeds_order:3991>3990');
  assert.equal(reconcileRefundAmount({ claimed: undefined, currency: 'CNY', order }).reason, 'refund_amount_missing');
  assert.equal(reconcileRefundAmount({ claimed: 3990, currency: 'USD', order }).reason, 'currency_mismatch:USD!=CNY');

  assert.equal(paymentNotificationOutcome({ result: { success: false, retryable: true, action: 'refund_waiting_for_order' } }), 'retry');
  assert.equal(paymentNotificationOutcome({ result: { success: false, action: 'payment_amount_mismatch', error: 'refund_exceeds_order:3991>3990' } }), 'reject');
});

test('P6 native notifications split into payment and refund fulfillment', () => {
  assert.equal(nativeEventKind({ kind: 'refund' }), 'refund');
  assert.equal(nativeEventKind({ kind: 'payment' }), 'payment');
  // 台账重放读的是历史 payload，缺 kind 时必须还能按厂商事件类型归类。
  assert.equal(nativeEventKind({ type: 'REFUND.SUCCESS' }), 'refund');
  assert.equal(nativeEventKind({ type: 'TRANSACTION.SUCCESS' }), 'payment');
  assert.equal(nativeEventKind({}), 'payment');
});

test('P6 wechat refund notifications decrypt instead of being dropped as unknown events', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const apiV3Key = '12345678901234567890123456789012';
  const resourceNonce = '123456789012';
  const payload = {
    out_trade_no: 'KO_order_1',
    transaction_id: '420000000020260917000000',
    out_refund_no: 'ref_KO_order_1',
    refund_id: '503000000020260917000000',
    refund_status: 'SUCCESS',
    success_time: '2026-09-17T10:00:00+08:00',
    amount: { refund: 3990, total: 3990, currency: 'CNY' },
  };

  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(resourceNonce, 'utf8'));
  cipher.setAAD(Buffer.from('certificate', 'utf8'));
  const sealed = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const body = JSON.stringify({
    id: 'wx-notification-1',
    event_type: 'REFUND.SUCCESS',
    resource_type: 'encrypt-resource',
    resource: {
      original_type: 'refund',
      algorithm: 'AEAD_AES_256_GCM',
      ciphertext: sealed.toString('base64'),
      nonce: resourceNonce,
      associated_data: 'certificate',
    },
  });

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(`1700000000\nheader-nonce\n${body}\n`, 'utf8');
  const provider = getWechatProvider({ mchId: '1600000000', apiV3Key, publicKey });
  const verified = provider.verifyWebhookSignature(body, {
    'wechatpay-signature': sign.sign(privateKey, 'base64'),
    'wechatpay-timestamp': '1700000000',
    'wechatpay-nonce': 'header-nonce',
  });

  assert.equal(verified.refund_status, 'SUCCESS');
  assert.equal(verified.amount.refund, 3990);
  assert.equal(verified.event_type, 'REFUND.SUCCESS');
  assert.equal(nativeEventKind({ type: verified.event_type }), 'refund');
});

test('P6 refund notifications get their own ledger event ids', () => {
  // 退款若复用到账通知的事件 ID，(provider, event_id) 主键会把退款判成重复通知直接丢弃。
  const wechatRoute = fs.readFileSync(new URL('../../app/api/billing/webhooks/wechat/route.js', import.meta.url), 'utf8');
  const alipayRoute = fs.readFileSync(new URL('../../app/api/billing/webhooks/alipay/route.js', import.meta.url), 'utf8');

  assert.match(wechatRoute, /id: `wx_refund_/);
  assert.match(wechatRoute, /kind: 'refund'/);
  assert.match(alipayRoute, /'alipay_refund'/);
  assert.match(alipayRoute, /kind: 'refund'/);
  assert.doesNotMatch(wechatRoute, /@\/lib\/repositories/);
  assert.doesNotMatch(alipayRoute, /@\/lib\/repositories/);
});
