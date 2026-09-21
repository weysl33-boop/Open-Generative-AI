import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

import {
  PAYMENT_PROVIDER_ACTIONS,
  PaymentProviderError,
  assertPaymentProvider,
  normalizeProviderError,
} from '../../lib/payments/provider.js';
import { createStripeProvider, verifyStripeWebhookSignature } from '../../lib/payments/stripeProvider.js';
import { createResilientProvider, resetProviderCircuits } from '../../lib/services/providerRuntime.js';

test('payment provider contract exposes all required payment operations', () => {
  const provider = Object.fromEntries(PAYMENT_PROVIDER_ACTIONS.map((action) => [action, async () => ({})]));
  assert.equal(assertPaymentProvider(provider), provider);
  assert.throws(() => assertPaymentProvider({}), /missing payment provider method/);
});

test('provider errors are normalized without exposing secrets or payloads', () => {
  const error = normalizeProviderError(new Error('Authorization: Bearer sk_test_secret upstream body'), {
    provider: 'stripe',
    action: 'refund',
  });
  assert.ok(error instanceof PaymentProviderError);
  assert.equal(error.provider, 'stripe');
  assert.equal(error.action, 'refund');
  assert.match(error.message, /支付供应商(暂时不可用|请求失败)/);
  assert.doesNotMatch(error.message, /sk_test_secret|Bearer/);
});

test('Stripe signature verification accepts any valid v1 signature and rejects stale or invalid signatures', () => {
  const secret = 'whsec_test_only';
  const payload = '{"id":"evt_test"}';
  const timestamp = 1_800_000_000;
  const digest = crypto.createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex');
  const nowMs = timestamp * 1000 + 2000;
  assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp},v1=bad,v1=${digest}`, secret, nowMs), true);
  assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp - 301},v1=${digest}`, secret, nowMs), false);
  assert.equal(verifyStripeWebhookSignature(payload, `t=${timestamp},v1=${'0'.repeat(64)}`, secret, nowMs), false);
});

test('Stripe provider delegates checkout, query, cancel and refund to an injected client', async () => {
  const calls = [];
  const client = {
    checkout: { sessions: {
      create: async (params, options) => { calls.push(['create', params, options]); return { id: 'cs_test', url: 'https://checkout.test' }; },
      retrieve: async (id) => { calls.push(['retrieve', id]); return { id, payment_intent: 'pi_test' }; },
    } },
    subscriptions: { cancel: async (id) => { calls.push(['cancel', id]); return { id, status: 'canceled' }; } },
    refunds: { create: async (params, options) => { calls.push(['refund', params, options]); return { id: 're_test', status: 'succeeded' }; } },
  };
  const provider = createStripeProvider({ client, secret: 'sk_test_unit', mode: 'test', randomSuffix: () => '12345678' });
  const checkout = await provider.createCheckout({
    order: { id: 'order_1', user_id: 'user_1', amount_minor: 990, currency: 'USD', metadata_json: { creditAmount: 2400 } },
    user: { id: 'user_1', email: 'user@example.com' },
    plan: { id: 'pro', name: 'Pro', monthlyUsd: 5 },
    successUrl: 'https://app.test/success',
    cancelUrl: 'https://app.test/cancel',
  });
  assert.equal(checkout.id, 'cs_test');
  assert.match(calls[0][2].idempotencyKey, /order_1/);
  assert.equal(calls[0][1].integration_identifier, 'koyosim_checkout_12345678');
  assert.equal(calls[0][1].mode, 'subscription');
  assert.deepEqual(calls[0][1].subscription_data.metadata, {
    user_id: 'user_1',
    plan_id: 'pro',
    order_id: 'order_1',
  });
  assert.equal(calls[0][1].line_items[0].price_data.unit_amount, 990);
  assert.equal(calls[0][1].line_items[0].price_data.currency, 'usd');
  await provider.retrievePayment('cs_test');
  await provider.cancel('sub_test');
  await provider.refund({ paymentIntentId: 'pi_test', idempotencyKey: 'refund:order_1' });
  assert.deepEqual(calls.map(([name]) => name), ['create', 'retrieve', 'cancel', 'refund']);
});

test('Stripe subscription renewals are mapped to invoice-specific idempotent orders', async () => {
  const fs = await import('node:fs');
  const dispatcher = fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8');
  const repository = fs.readFileSync(new URL('../../lib/repositories/webhooks.js', import.meta.url), 'utf8');
  const refundService = fs.readFileSync(new URL('../../lib/services/billing.js', import.meta.url), 'utf8');

  assert.match(dispatcher, /invoice\.paid/);
  assert.match(dispatcher, /checkout\.session\.async_payment_succeeded/);
  assert.match(dispatcher, /subscription_cycle/);
  assert.match(dispatcher, /paid_out_of_band === true/);
  assert.match(dispatcher, /payments\?\.data/);
  assert.match(dispatcher, /createStripeRenewalOrderInTransaction\(/);
  assert.match(dispatcher, /payment:\$\{[^}]*\.id\}:credits/);
  assert.match(dispatcher, /customer\.subscription\.created/);
  assert.match(repository, /stripe-renewal:\$\{invoiceId\}/);
  assert.match(repository, /createStripeRenewalOrderInTransaction/);
  assert.match(refundService, /metadata_json[\s\S]*invoiceId/);
});

test('resilient provider 不原地重试提交类调用，但失败照样计入熔断', async () => {
  resetProviderCircuits();
  let attempts = 0;
  const provider = createResilientProvider({
    provider: { async generate() { attempts += 1; throw Object.assign(new Error('temporary'), { code: 'UPSTREAM_503' }); } },
    providerName: 'mock-p6',
    maxAttempts: 2,
    failureThreshold: 1,
    resetMs: 60_000,
    sleep: async () => {},
  });
  await assert.rejects(provider.generate({}), /支付供应商/);
  // createTask 超时时无法知道上游收没收下这次任务：原地重试会开出第二个任务、重复占额度，
  // 提交类失败只能交给生命周期层按「换渠道」处理。
  assert.equal(attempts, 1);
  await assert.rejects(provider.generate({}), /熔断|circuit/i);
});

test('resilient provider 仍然重试轮询这类幂等读操作', async () => {
  resetProviderCircuits();
  let polls = 0;
  const provider = createResilientProvider({
    provider: {
      async generate() { return { status: 'succeeded' }; },
      async poll() {
        polls += 1;
        if (polls < 2) throw Object.assign(new Error('temporary'), { code: 'UPSTREAM_503' });
        return { status: 'succeeded', resultUrl: '/uploads/ok.png' };
      },
    },
    providerName: 'mock-p6-poll',
    maxAttempts: 2,
    failureThreshold: 5,
    resetMs: 60_000,
    sleep: async () => {},
  });
  assert.equal((await provider.poll({ providerRequestId: 'req_1' })).status, 'succeeded');
  assert.equal(polls, 2);
});

test('resilient provider enforces a timeout even when a provider ignores AbortSignal', async () => {
  resetProviderCircuits();
  const provider = createResilientProvider({
    provider: { async generate() { return new Promise(() => {}); } },
    providerName: 'mock-p6-timeout',
    timeoutMs: 10,
    maxAttempts: 1,
    sleep: async () => {},
  });
  await assert.rejects(provider.generate({}), (error) => error.code === 'PROVIDER_TIMEOUT');
});

test('P6 migration and routes contain payment ledger, event replay and raw-body verification seams', () => {
  const migration = fs.readFileSync(new URL('../../lib/db/migrations/009_payment_provider_v2.sql', import.meta.url), 'utf8');
  const uniquenessMigration = fs.readFileSync(new URL('../../lib/db/migrations/013_payment_success_uniqueness.sql', import.meta.url), 'utf8');
  assert.match(migration, /payment_ledger/);
  assert.match(migration, /orders_provider_idempotency_idx/);
  assert.match(migration, /provider_call_logs/);
  assert.match(uniquenessMigration, /payment_ledger_one_success_per_order_idx/);
  assert.match(fs.readFileSync(new URL('../../app/api/billing/webhooks/stripe/route.js', import.meta.url), 'utf8'), /request\.text\(\)/);
  assert.match(fs.readFileSync(new URL('../../app/api/billing/checkout/route.js', import.meta.url), 'utf8'), /getStripeProvider|createPayment/);
  assert.match(fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8'), /withTransaction|payment_ledger/);
  assert.match(fs.readFileSync(new URL('../../lib/db/migrations/012_payment_credit_refunds.sql', import.meta.url), 'utf8'), /credit_refund_obligations/);
  assert.match(fs.readFileSync(new URL('../../lib/financial/creditService.js', import.meta.url), 'utf8'), /reversePaymentCredits/);
  assert.match(fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8'), /credits_refund/);
  assert.match(fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8'), /retryable/);
  assert.match(fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8'), /replayError = `\$\{result\.action/);
});

test('P6 generation and proxy paths resolve server-managed provider secrets', () => {
  const secretService = fs.readFileSync(new URL('../../lib/services/providerSecrets.js', import.meta.url), 'utf8');
  const generationCore = fs.readFileSync(new URL('../../lib/services/generationCore.js', import.meta.url), 'utf8');
  const adapters = fs.readFileSync(new URL('../../lib/adapters/index.js', import.meta.url), 'utf8');
  const providerService = fs.readFileSync(new URL('../../lib/services/providers.js', import.meta.url), 'utf8');
  const legacyProxy = fs.readFileSync(new URL('../../app/api/api/v1/[[...path]]/route.js', import.meta.url), 'utf8');

  assert.match(secretService, /getProviderSecret/);
  assert.match(secretService, /MUAPI_API_KEY/);
  // 取密钥的位置在生命周期层与 Adapter 工厂：调用哪个网关由路由决定，密钥也在那一刻按网关取。
  assert.match(generationCore, /getServerProviderApiKey/);
  assert.match(adapters, /getServerProviderApiKey/);
  assert.match(providerService, /getServerProviderApiKey/);
  assert.match(legacyProxy, /getServerProviderApiKey/);
  assert.doesNotMatch(legacyProxy, /getApiKeyFromRequest/);
});

test('checkout UI has no fake payment success or QR simulation', () => {
  const source = fs.readFileSync(new URL('../../components/account/RechargeModal.js', import.meta.url), 'utf8');
  assert.match(source, /\/api\/billing\/checkout/);
  assert.match(source, /前往 Stripe 收银台/);
  assert.doesNotMatch(source, /模拟支付成功|setTimeout\(/);
  assert.doesNotMatch(source, /QrCode|showQrCode|SUBSCRIPTION_PLANS/);
});
