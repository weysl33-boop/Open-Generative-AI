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
/**
 * 建单二维码：qr_code 只能原样来自支付宝。
 *
 * 本地/线上都拿不到真实 precreate 成功响应（商户号未签约「当面付」，固定回
 * 40004 / ACQ.ACCESS_FORBIDDEN），所以把支付宝的 10000 应答复刻成签名响应，
 * 验证 provider 不改内容、不自拼 URL、缺字段时不伪造。
 */
const PRECREATE_OK = {
  code: '10000',
  msg: 'Success',
  out_trade_no: 'order_test_0001',
  qr_code: 'https://qr.alipay.com/bax00000000000000000000',
};
const CHECKOUT_ARGS = {
  order: { id: 'order_test_0001', amount_minor: 35000, currency: 'USD' },
  user: { id: 'usr_test_0001' },
  plan: { id: 'plan_creator', name: '创作者套餐', monthlyUsd: 350 },
};

test('建单：支付宝签发的 qr_code 原样透传，不加工不拼接', async () => {
  const restore = stubFetch(rawResponse('alipay.trade.precreate', PRECREATE_OK, merchant.privateKey));
  try {
    const checkout = await providerWith(merchant.publicKey).createCheckout(CHECKOUT_ARGS);
    assert.equal(checkout.qr_code, PRECREATE_OK.qr_code);
    assert.equal(checkout.url, PRECREATE_OK.qr_code);
    assert.equal(checkout.isPagePay, undefined);
    assert.equal(checkout.id, 'order_test_0001');
    const ttl = new Date(checkout.expiresAt).getTime() - Date.now();
    assert.ok(ttl > 29 * 60 * 1000 && ttl <= 30 * 60 * 1000, `expiresAt 偏移异常: ${ttl}`);
  } finally {
    restore();
  }
});

test('建单：外来私钥签的 10000 不得产出任何二维码', async () => {
  const restore = stubFetch(rawResponse('alipay.trade.precreate', PRECREATE_OK, attacker.privateKey));
  try {
    await assert.rejects(
      () => providerWith(merchant.publicKey).createCheckout(CHECKOUT_ARGS),
      (error) => {
        assert.equal(error.code, 'RESPONSE_SIGNATURE_INVALID');
        assert.ok(!String(error.message).includes('qr.alipay.com'));
        return true;
      }
    );
  } finally {
    restore();
  }
});

test('建单：回 10000 但缺 qr_code 时硬失败，不回退自建链接', async () => {
  const noQr = { code: '10000', msg: 'Success', out_trade_no: 'order_test_0001' };
  const restore = stubFetch(rawResponse('alipay.trade.precreate', noQr, merchant.privateKey));
  try {
    await assert.rejects(
      () => providerWith(merchant.publicKey).createCheckout(CHECKOUT_ARGS),
      (error) => error.code === 'ALIPAY_QR_MISSING'
    );
  } finally {
    restore();
  }
});

/**
 * 桥接是限定单点的临时措施，不是通用兜底：只有 ACQ.ACCESS_FORBIDDEN 才改投
 * 电脑网站支付，其他失败必须照原样抛错，否则任何网关异常都会静默变成
 * 一条自拼的收银台链接。
 */
test('建单：仅未签约「当面付」走桥接，其他失败一律硬报错', async () => {
  const forbidden = {
    code: '40004',
    msg: 'Business Failed',
    sub_code: 'ACQ.ACCESS_FORBIDDEN',
    sub_msg: 'ACCESS_FORBIDDEN',
  };
  const restoreForbidden = stubFetch(rawResponse('alipay.trade.precreate', forbidden, merchant.privateKey));
  let bridged = null;
  try {
    bridged = await providerWith(merchant.publicKey).createCheckout(CHECKOUT_ARGS);
  } finally {
    restoreForbidden();
  }
  assert.equal(bridged.isPagePay, true);
  assert.ok(bridged.qr_code.startsWith('https://openapi.alipay.com/gateway.do?'));
  assert.match(bridged.qr_code, /method=alipay\.trade\.page\.pay/);
  assert.match(bridged.qr_code, /sign=/);
  assert.ok(!bridged.qr_code.includes('PRIVATE KEY'));

  const invalid = {
    code: '40002',
    msg: 'Invalid Arguments',
    sub_code: 'ACQ.INVALID_PARAMETER',
    sub_msg: '参数无效',
  };
  const restoreInvalid = stubFetch(rawResponse('alipay.trade.precreate', invalid, merchant.privateKey));
  try {
    await assert.rejects(
      () => providerWith(merchant.publicKey).createCheckout(CHECKOUT_ARGS),
      (error) => {
        assert.notEqual(error.code, 'ACQ.ACCESS_FORBIDDEN');
        assert.equal(error.cause.alipaySubCode, 'ACQ.INVALID_PARAMETER');
        return true;
      }
    );
  } finally {
    restoreInvalid();
  }
});

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
