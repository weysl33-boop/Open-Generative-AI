import test from 'node:test';
import assert from 'node:assert/strict';

import {
  getPlanCreditGrantAmount,
  normalizeBillingCycle,
  resolveOrderCreditGrantAmount,
} from '../../lib/payments/planFulfillment.js';
import { findCreditPackById, listCreditPacks } from '../../lib/payments/creditPacks.js';

test('paid plan fulfillment grants the published base plus bonus credits', () => {
  const plans = [
    { id: 'starter', quotaBase: 2000, quotaBonus: 400, expected: 2400 },
    { id: 'basic', quotaBase: 5000, quotaBonus: 1500, expected: 6500 },
    { id: 'plus', quotaBase: 10000, quotaBonus: 4000, expected: 14000 },
    { id: 'pro', quotaBase: 20000, quotaBonus: 10000, expected: 30000 },
  ];

  for (const { expected, ...plan } of plans) {
    assert.equal(getPlanCreditGrantAmount(plan), expected, `${plan.id} fulfillment amount`);
  }
});

test('free plans grant no paid credits and incomplete paid plans fail closed', () => {
  assert.equal(getPlanCreditGrantAmount({ id: 'free', quotaBase: 0, quotaBonus: 0 }), 0);
  assert.throws(
    () => getPlanCreditGrantAmount({ id: 'starter', quotaBase: 0, quotaBonus: 0 }),
    (error) => error.code === 'PLAN_CREDIT_AMOUNT_INVALID',
  );
});

test('checkout accepts only a billing cycle the current order and renewal path can fulfill', () => {
  assert.equal(normalizeBillingCycle(undefined), 'monthly');
  assert.equal(normalizeBillingCycle('monthly'), 'monthly');
  assert.equal(normalizeBillingCycle('quarterly'), 'quarterly');
  assert.equal(normalizeBillingCycle('yearly'), 'yearly');
  assert.throws(
    () => normalizeBillingCycle('weekly'),
    (error) => error.code === 'BILLING_CYCLE_UNAVAILABLE',
  );
  assert.equal(normalizeBillingCycle('one_time', { productType: 'credit_pack' }), 'one_time');
  assert.throws(
    () => normalizeBillingCycle('quarterly', { productType: 'credit_pack' }),
    (error) => error.code === 'BILLING_CYCLE_UNAVAILABLE',
  );
});

test('public credit-pack catalog is server-owned and snapshots the exact reference amounts', () => {
  assert.deepEqual(listCreditPacks().map(({ credits, priceCny }) => [credits, priceCny]), [
    [490, 49], [1400, 140], [2100, 210], [3500, 350], [7000, 700], [14000, 1400], [70000, 7000],
  ]);
  assert.equal(findCreditPackById('credit_490').credits, 490);
  assert.equal(findCreditPackById('credit_70000').priceCny, 7000);
  assert.equal(findCreditPackById('unknown'), null);
});

test('credit-pack fulfillment requires a valid immutable one-time snapshot and does not need a subscription plan row', () => {
  const order = {
    plan_id: 'credit_490',
    billing_cycle: 'one_time',
    metadata_json: { productType: 'credit_pack', productId: 'credit_490', creditAmount: 490 },
  };
  assert.equal(resolveOrderCreditGrantAmount({ order, plan: null }), 490);
  assert.throws(
    () => resolveOrderCreditGrantAmount({ order: { ...order, metadata_json: { ...order.metadata_json, creditAmount: 491 } }, plan: null }),
    (error) => error.code === 'CREDIT_PACK_SNAPSHOT_INVALID',
  );
  assert.throws(
    () => resolveOrderCreditGrantAmount({ order: { ...order, billing_cycle: 'monthly' }, plan: null }),
    (error) => error.code === 'BILLING_CYCLE_UNAVAILABLE',
  );
  assert.throws(
    () => resolveOrderCreditGrantAmount({ order: { ...order, plan_id: 'credit_1400' }, plan: null }),
    (error) => error.code === 'ORDER_PLAN_SNAPSHOT_MISMATCH',
  );
});

test('payment fulfillment uses the immutable server-side order snapshot before catalog fallback', () => {
  const plan = { id: 'starter', quotaBase: 9000, quotaBonus: 1000 };
  assert.equal(resolveOrderCreditGrantAmount({
    order: { metadata_json: { creditAmount: 2400 } },
    plan,
  }), 2400);
  assert.equal(resolveOrderCreditGrantAmount({
    order: { metadata_json: '{"creditAmount":2400}' },
    plan,
  }), 2400);
  assert.equal(resolveOrderCreditGrantAmount({ order: { metadata_json: {} }, plan }), 10000);
  assert.throws(
    () => resolveOrderCreditGrantAmount({ order: { metadata_json: { creditAmount: 0 } }, plan }),
    (error) => error.code === 'ORDER_CREDIT_SNAPSHOT_INVALID',
  );
  assert.throws(
    () => resolveOrderCreditGrantAmount({ order: { plan_id: 'basic', billing_cycle: 'yearly', metadata_json: { planId: 'starter', creditAmount: 2400 } }, plan }),
    (error) => error.code === 'ORDER_PLAN_SNAPSHOT_MISMATCH',
  );
  assert.throws(
    () => resolveOrderCreditGrantAmount({ order: { plan_id: 'starter', billing_cycle: 'invalid_cycle', metadata_json: { planId: 'starter', creditAmount: 2400 } }, plan }),
    (error) => error.code === 'BILLING_CYCLE_UNAVAILABLE',
  );
});

test('checkout snapshots monthly cycle and server-derived credit amount into each order', async () => {
  const fs = await import('node:fs');
  const paymentService = fs.readFileSync(new URL('../../lib/services/paymentService.js', import.meta.url), 'utf8');
  const checkoutRoute = fs.readFileSync(new URL('../../app/api/billing/checkout/route.js', import.meta.url), 'utf8');
  const billingService = fs.readFileSync(new URL('../../lib/services/billing.js', import.meta.url), 'utf8');
  const billingRepository = fs.readFileSync(new URL('../../lib/repositories/billing.js', import.meta.url), 'utf8');
  const webhookDispatcher = fs.readFileSync(new URL('../../lib/services/webhookDispatcher.js', import.meta.url), 'utf8');

  assert.match(paymentService, /normalizeBillingCycle\(billingCycle/);
  assert.match(paymentService, /getPlanCreditGrantAmount\(plan\)/);
  assert.match(checkoutRoute, /billingCycle:\s*body\.billingCycle/);
  assert.match(billingService, /billingCycle: normalizedCycle,[\s\S]*?creditAmount: expectedCreditAmount/);
  assert.match(billingRepository, /billing_cycle/);
  assert.match(billingRepository, /creditAmount/);
  assert.match(webhookDispatcher, /resolveOrderCreditGrantAmount\(/);
  assert.doesNotMatch(webhookDispatcher, /plan\?\.id === 'team' \? 2000/);
  assert.doesNotMatch(webhookDispatcher, /plan\?\.id === 'pro' \? 500/);
});

test('only the canonical page offers products; unsupported cycles and unavailable payment channels stay disabled', async () => {
  const fs = await import('node:fs');
  const rechargeModal = fs.readFileSync(new URL('../../components/account/RechargeModal.js', import.meta.url), 'utf8');
  const pricingClient = fs.readFileSync(new URL('../../components/pricing/PricingClient.js', import.meta.url), 'utf8');
  const userMenu = fs.readFileSync(new URL('../../components/UserDropdownMenu.js', import.meta.url), 'utf8');

  assert.match(rechargeModal, /providers\[method\]\?\.enabled/);
  assert.match(rechargeModal, /providers\[payMethod\]\?\.enabled/);
  assert.match(rechargeModal, /\/api\/billing\/credit-packs/);
  assert.match(pricingClient, /setBillingCycle\('yearly'\)/);
  assert.match(pricingClient, /setBillingCycle\('quarterly'\)/);
  assert.doesNotMatch(pricingClient, /customerScope|versionTab|个人版\s*\|\s*团队版/);
  assert.match(pricingClient, /\/api\/billing\/plans/);
  assert.match(pricingClient, /\/api\/billing\/credit-packs/);
  // 两种写法都接受：手写的 /zh 三元，或走 localeSwitch 注册表派生前缀。
  // 断言的性质是"入口必须落在 /pricing 这棵唯一的树上"，不是某一种拼写。
  assert.ok(
    userMenu.includes("isZh ? '/zh/pricing' : '/pricing'")
      || /localizedPathFor\(\s*['"]\/pricing['"]/.test(userMenu),
    'account menu must route to the canonical /pricing page'
  );
  assert.doesNotMatch(userMenu, /SubscriptionModal/);
});
