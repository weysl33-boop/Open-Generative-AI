import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { getAlipayProvider, verifyAlipayResponseSign } from '../../lib/payments/alipayProvider.js';

const merchant = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});
const attacker = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  publicKeyEncoding: { type: 'spki', format: 'pem' },
});

/** 复刻支付宝的返回形态：紧凑 JSON + 尾随 sign，含嵌套数组与中文，用来卡住「重新 stringify 就验不过」这条线。 */
function rawResponse(method, payload, signingKey) {
  const key = `${method.replace(/\./g, '_')}_response`;
  const content = JSON.stringify(payload);
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(content, 'utf8');
  return `{"${key}":${content},"sign":"${signer.sign(signingKey, 'base64')}"}`;
}

function providerWith(publicKey) {
  return getAlipayProvider({
    appId: '2021000000000000',
    privateKey: merchant.privateKey,
    publicKey,
    gateway: 'https://openapi.alipay.com/gateway.do',
    notifyUrl: 'https://www.koyosim.com/api/billing/webhooks/alipay',
  });
}

function stubFetch(body) {
  const original = globalThis.fetch;
  globalThis.fetch = async () => ({ text: async () => body, json: async () => JSON.parse(body) });
  return () => { globalThis.fetch = original; };
}

const QUERY_PAID = {
  code: '10000',
  msg: 'Success',
  out_trade_no: 'order_test_0001',
  trade_no: '2026092222001234567890',
  trade_status: 'TRADE_SUCCESS',
  total_amount: '350.00',
  subject: 'KoyoSIM AI 算力套餐 - 创作者套餐',
  buyer_logon_id: '138****0000',
  send_pay_date: '2026-09-22 12:00:00',
  fund_bill_list: [{ amount: '350.00', fund_channel: 'ALIPAYACCOUNT' }],
};

test('响应验签：支付宝公钥验得过，换一把公钥就验不过', () => {
  const body = rawResponse('alipay.trade.query', QUERY_PAID, merchant.privateKey);
  assert.equal(verifyAlipayResponseSign(body, 'alipay_trade_query_response', merchant.publicKey), true);
  assert.equal(verifyAlipayResponseSign(body, 'alipay_trade_query_response', attacker.publicKey), false);
  assert.equal(verifyAlipayResponseSign(body, 'alipay_trade_query_response', ''), false);
  assert.equal(verifyAlipayResponseSign('{"error_response":{"code":"40002"}}', 'alipay_trade_query_response', merchant.publicKey), false);
});

test('响应验签：改一个字段（金额/状态）就验不过', () => {
  const body = rawResponse('alipay.trade.query', QUERY_PAID, merchant.privateKey);
  const tamperedAmount = body.replace('"total_amount":"350.00"', '"total_amount":"0.01"');
  const tamperedStatus = body.replace('"trade_status":"TRADE_SUCCESS"', '"trade_status":"TRADE_SUCCESS_OK"');
  assert.equal(verifyAlipayResponseSign(tamperedAmount, 'alipay_trade_query_response', merchant.publicKey), false);
  assert.equal(verifyAlipayResponseSign(tamperedStatus, 'alipay_trade_query_response', merchant.publicKey), false);
});

test('查单：官方签名的 TRADE_SUCCESS 才判为已支付', async () => {
  const restore = stubFetch(rawResponse('alipay.trade.query', QUERY_PAID, merchant.privateKey));
  try {
    const result = await providerWith(merchant.publicKey).retrievePayment('order_test_0001');
    assert.equal(result.paid, true);
    assert.equal(result.transactionId, QUERY_PAID.trade_no);
    assert.equal(result.amountTotal, 35000);
  } finally {
    restore();
  }
});

test('伪造查单：外来私钥签的 TRADE_SUCCESS 不得产生任何支付结论', async () => {
  const restore = stubFetch(rawResponse('alipay.trade.query', QUERY_PAID, attacker.privateKey));
  try {
    await assert.rejects(
      () => providerWith(merchant.publicKey).retrievePayment('order_test_0001'),
      (error) => {
        assert.equal(error.code, 'RESPONSE_SIGNATURE_INVALID');
        assert.notEqual(error.paid, true);
        return true;
      }
    );
  } finally {
    restore();
  }
});

test('篡改查单：签名后改金额会被拒', async () => {
  const signed = rawResponse('alipay.trade.query', QUERY_PAID, merchant.privateKey);
  const restore = stubFetch(signed.replace('"total_amount":"350.00"', '"total_amount":"0.01"'));
  try {
    await assert.rejects(
      () => providerWith(merchant.publicKey).retrievePayment('order_test_0001'),
      (error) => error.code === 'RESPONSE_SIGNATURE_INVALID'
    );
  } finally {
    restore();
  }
});

/**
 * 业务失败响应：验签不过也必须照原样抛支付宝原话。
 *
 * 用 sub_code 不带桥接语义的失败码：precreate 上的 ACQ.ACCESS_FORBIDDEN 会走电脑网站支付
 * 桥接并成功返回收银台链接，测不到"抛错"这条分支。查单没有桥接，失败就是失败。
 * 断言打在 error.cause 上，因为 provider 外层统一包成 PaymentProviderError，
 * 支付宝原话只留在 cause 里。
 */
test('业务失败响应：验签不过也照原样抛支付宝原话，不吞掉排障信息', async () => {
  const notExist = {
    code: '40004',
    msg: 'Business Failed',
    sub_code: 'ACQ.TRADE_NOT_EXIST',
    sub_msg: '交易不存在',
    out_trade_no: 'order_test_0001',
  };
  const restore = stubFetch(rawResponse('alipay.trade.query', notExist, attacker.privateKey));
  try {
    await assert.rejects(
      () => providerWith(merchant.publicKey).retrievePayment('order_test_0001'),
      (error) => {
        assert.notEqual(error.code, 'RESPONSE_SIGNATURE_INVALID');
        assert.equal(error.cause.code, 'ACQ.TRADE_NOT_EXIST');
        assert.equal(error.cause.alipayCode, '40004');
        assert.equal(error.cause.alipaySubCode, 'ACQ.TRADE_NOT_EXIST');
        assert.equal(error.cause.alipayMsg, 'Business Failed');
        assert.equal(error.cause.alipaySubMsg, '交易不存在');
        return true;
      }
    );
  } finally {
    restore();
  }
});
