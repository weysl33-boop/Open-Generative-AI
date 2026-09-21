import { findCreditPackById } from './creditPacks.js';

export function getPlanCreditGrantAmount(plan) {
  if (String(plan?.id || '').toLowerCase() === 'free') return 0;

  const base = Number(plan?.quotaBase);
  const bonus = Number(plan?.quotaBonus);
  const total = base + bonus;
  if (!Number.isSafeInteger(base) || base < 0
    || !Number.isSafeInteger(bonus) || bonus < 0
    || !Number.isSafeInteger(total) || total <= 0) {
    throw Object.assign(new Error('付费套餐缺少有效的算力发放配置'), {
      code: 'PLAN_CREDIT_AMOUNT_INVALID',
    });
  }
  return total;
}

export function normalizeBillingCycle(value, { productType = 'subscription' } = {}) {
  const cycle = String(value || 'monthly').trim().toLowerCase();
  if (productType === 'credit_pack') {
    if (cycle === 'one_time') return cycle;
    throw Object.assign(new Error('通用算力包必须使用一次性支付周期'), {
      code: 'BILLING_CYCLE_UNAVAILABLE',
    });
  }
  if (cycle !== 'monthly') {
    throw Object.assign(new Error('当前暂只支持月付，季付与年付需待履约周期接入后开放'), {
      code: 'BILLING_CYCLE_UNAVAILABLE',
    });
  }
  return cycle;
}

function readOrderMetadata(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value.trim()) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function getOrderProductType(order) {
  const metadata = readOrderMetadata(order?.metadata_json);
  const productType = String(metadata.productType || metadata.product_type || 'subscription').trim().toLowerCase();
  if (productType !== 'subscription' && productType !== 'credit_pack') {
    throw Object.assign(new Error('订单商品类型无效，不能履约'), { code: 'ORDER_PRODUCT_TYPE_INVALID' });
  }
  return productType;
}

export function resolveOrderCreditGrantAmount({ order, plan }) {
  const metadata = readOrderMetadata(order?.metadata_json);
  const productType = getOrderProductType(order);
  const snapshotPlanId = metadata.productId ?? metadata.product_id ?? metadata.planId ?? metadata.plan_id;
  if (snapshotPlanId && order?.plan_id && snapshotPlanId !== order.plan_id) {
    throw Object.assign(new Error('订单套餐快照与实际订单不一致，不能履约'), {
      code: 'ORDER_PLAN_SNAPSHOT_MISMATCH',
    });
  }
  const billingCycle = order?.billing_cycle || metadata.billingCycle || metadata.billing_cycle || (productType === 'credit_pack' ? 'one_time' : 'monthly');
  normalizeBillingCycle(billingCycle, { productType });
  const snapshot = metadata.creditAmount ?? metadata.credit_amount;

  if (productType === 'credit_pack') {
    const pack = findCreditPackById(order?.plan_id || snapshotPlanId);
    const amount = Number(snapshot);
    if (!pack || !Number.isSafeInteger(amount) || amount !== pack.credits) {
      throw Object.assign(new Error('算力包订单快照无效，不能履约'), { code: 'CREDIT_PACK_SNAPSHOT_INVALID' });
    }
    return pack.credits;
  }

  if (snapshot !== undefined && snapshot !== null) {
    const amount = Number(snapshot);
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw Object.assign(new Error('订单中的算力快照无效，不能履约'), {
        code: 'ORDER_CREDIT_SNAPSHOT_INVALID',
      });
    }
    return amount;
  }
  return getPlanCreditGrantAmount(plan);
}
