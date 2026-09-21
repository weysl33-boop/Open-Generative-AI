import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import {
  buildWechatV3AuthHeader,
  decryptWechatV3Resource,
  getWechatProvider,
  verifyWechatV3Signature,
} from '../../lib/payments/wechatProvider.js';
import {
  buildAlipaySignString,
  getAlipayProvider,
  signAlipayParams,
  verifyAlipaySignature,
} from '../../lib/payments/alipayProvider.js';
import { assertPaymentProvider } from '../../lib/payments/provider.js';

test('wechat provider implements all required payment actions', () => {
  const provider = getWechatProvider();
  assert.equal(typeof provider.createCheckout, 'function');
  assert.equal(typeof provider.retrievePayment, 'function');
  assert.equal(typeof provider.cancel, 'function');
  assert.equal(typeof provider.refund, 'function');
  assert.equal(typeof provider.verifyWebhookSignature, 'function');
  assert.equal(assertPaymentProvider(provider), provider);
});

test('alipay provider implements all required payment actions', () => {
  const provider = getAlipayProvider();
  assert.equal(typeof provider.createCheckout, 'function');
  assert.equal(typeof provider.retrievePayment, 'function');
  assert.equal(typeof provider.cancel, 'function');
  assert.equal(typeof provider.refund, 'function');
  assert.equal(typeof provider.verifyWebhookSignature, 'function');
  assert.equal(assertPaymentProvider(provider), provider);
});

test('alipay sign string builds sorted query string ignoring sign and empty params', () => {
  const params = {
    c: 3,
    a: 'first',
    sign: 'should_be_ignored',
    sign_type: 'RSA2',
    b: 'second',
    empty_val: '',
    null_val: null,
  };
  // 请求签名保留 sign_type；异步通知验签按支付宝官方规则同时剔除 sign 与 sign_type。
  assert.equal(buildAlipaySignString(params), 'a=first&b=second&c=3&sign_type=RSA2');
  assert.equal(buildAlipaySignString(params, true), 'a=first&b=second&c=3');
});

test('payment webhooks fail closed when the platform public key is missing', () => {
  const params = { out_trade_no: 'KO1', trade_status: 'TRADE_SUCCESS', sign: 'forged' };
  assert.equal(verifyAlipaySignature(params, null), false);
  assert.equal(
    verifyWechatV3Signature({ timestamp: '1700000000', nonce: 'n', body: '{}', signature: 'forged', wechatPublicKey: null }),
    false
  );
});

test('alipay RSA2 signature generation and verification', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const params = {
    app_id: '2021000000000000',
    method: 'alipay.trade.precreate',
    out_trade_no: 'order_test_123',
    total_amount: '39.90',
  };

  const sign = signAlipayParams(params, privateKey);
  assert.ok(sign && typeof sign === 'string');

  const signedParams = { ...params, sign, sign_type: 'RSA2' };
  const valid = verifyAlipaySignature(signedParams, publicKey);
  assert.equal(valid, true);

  const tamperedParams = { ...signedParams, total_amount: '0.01' };
  const invalid = verifyAlipaySignature(tamperedParams, publicKey);
  assert.equal(invalid, false);
});

test('wechat V3 auth header structure and signature', () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const authHeader = buildWechatV3AuthHeader({
    method: 'POST',
    urlPath: '/v3/pay/transactions/native',
    timestamp: '1700000000',
    nonce: 'random_nonce_string_123456',
    body: '{"amount":990}',
    mchId: '1600000000',
    serialNo: 'ABCDEF1234567890',
    privateKey,
  });

  assert.match(authHeader, /^WECHATPAY2-SHA256-RSA2048 /);
  assert.match(authHeader, /mchid="1600000000"/);
  assert.match(authHeader, /serial_no="ABCDEF1234567890"/);
  assert.match(authHeader, /signature="[A-Za-z0-9+/=]+"/);
});

test('wechat V3 notification AES-GCM decryption', () => {
  const apiV3Key = '12345678901234567890123456789012'; // 32 字节
  const nonce = '123456789012'; // 12 字节
  const associatedData = 'certificate';
  const originalPayload = {
    out_trade_no: 'order_wx_001',
    transaction_id: '420000000020260917000000',
    trade_state: 'SUCCESS',
    amount: { total: 3990, currency: 'CNY' },
  };
  const plaintext = JSON.stringify(originalPayload);

  // 模拟微信端加密
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(apiV3Key, 'utf8'), Buffer.from(nonce, 'utf8'));
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const ciphertextBuffer = Buffer.concat([encrypted, tag]);

  const resource = {
    ciphertext: ciphertextBuffer.toString('base64'),
    nonce,
    associated_data: associatedData,
  };

  const decrypted = decryptWechatV3Resource(resource, apiV3Key);
  assert.deepEqual(decrypted, originalPayload);
  assert.equal(decrypted.trade_state, 'SUCCESS');
  assert.equal(decrypted.out_trade_no, 'order_wx_001');
});

test('payment routes and services export wechat and alipay capabilities', () => {
  const paymentService = fs.readFileSync(new URL('../../lib/services/paymentService.js', import.meta.url), 'utf8');
  assert.match(paymentService, /resolveWechatProvider/);
  assert.match(paymentService, /resolveAlipayProvider/);
  assert.match(paymentService, /syncOrderPaymentStatus/);
  assert.match(paymentService, /provider === 'wechat'/);
  assert.match(paymentService, /provider === 'alipay'/);

  const wechatWebhook = fs.readFileSync(new URL('../../app/api/billing/webhooks/wechat/route.js', import.meta.url), 'utf8');
  assert.match(wechatWebhook, /resolveWechatProvider/);
  assert.match(wechatWebhook, /dispatchPaymentWebhook/);
  assert.match(wechatWebhook, /SUCCESS/);
  // 密钥必须经服务层解析（env 缺失时回落 provider_secrets），且不得直连仓储取密钥。
  assert.doesNotMatch(wechatWebhook, /@\/lib\/repositories/);

  const alipayWebhook = fs.readFileSync(new URL('../../app/api/billing/webhooks/alipay/route.js', import.meta.url), 'utf8');
  assert.match(alipayWebhook, /resolveAlipayProvider/);
  assert.match(alipayWebhook, /dispatchPaymentWebhook/);
  assert.match(alipayWebhook, /success/);
  assert.doesNotMatch(alipayWebhook, /@\/lib\/repositories/);

  const orderStatusRoute = fs.readFileSync(new URL('../../app/api/billing/orders/[id]/status/route.js', import.meta.url), 'utf8');
  assert.match(orderStatusRoute, /syncOrderPaymentStatus/);
});
