import 'server-only';

import { nowIso, withTransaction } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as billingRepo from '../repositories/billing.js';
import * as settingsRepo from '../repositories/settings.js';
import * as plansRepo from '../repositories/plans.js';
import { getCreditWallet } from '../financial/creditService.js';
import { getCurrencyWallet } from '../financial/currencyService.js';
import { getCreditBalance } from './credits.js';
import { getStripeProvider } from '../payments/stripeProvider.js';
import { getStripeMerchantSecret, resolveAlipayProvider, resolveWechatProvider } from '../payments/providerCredentials.js';
import { reversePaymentCredits } from '../financial/creditService.js';
import { publicErrorMessage } from '../security/publicError.js';
import { getPlanCreditGrantAmount, normalizeBillingCycle } from '../payments/planFulfillment.js';
import { findCreditPackById } from '../payments/creditPacks.js';

export async function listPublicPlans() {
  return plansRepo.listPublicPlans();
}

export async function listUserOrders(userId, limit = 20) {
  return billingRepo.listUserOrders(userId, limit);
}

export async function createOrder({ userId, provider, plan, productType = 'subscription', productId = plan?.id, amountMinor, currency, idempotencyKey, billingCycle = 'monthly', creditAmount }) {
  const normalizedKey = String(idempotencyKey || '').trim().slice(0, 200);
  if (normalizedKey.length < 8) {
    throw Object.assign(new Error('支付订单必须提供有效的幂等键'), { code: 'IDEMPOTENCY_REQUIRED' });
  }
  const normalizedProductType = String(productType || 'subscription').trim().toLowerCase();
  if (!['subscription', 'credit_pack'].includes(normalizedProductType)) {
    throw Object.assign(new Error('不支持的订单商品类型'), { code: 'ORDER_PRODUCT_TYPE_INVALID' });
  }
  const normalizedCycle = normalizeBillingCycle(billingCycle, { productType: normalizedProductType });
  const pack = normalizedProductType === 'credit_pack' ? findCreditPackById(productId) : null;
  if (normalizedProductType === 'credit_pack' && (!pack || plan?.id !== pack.id)) {
    throw Object.assign(new Error('算力包不存在或不可购买'), { code: 'CREDIT_PACK_NOT_FOUND' });
  }
  const expectedCreditAmount = pack ? pack.credits : getPlanCreditGrantAmount(plan);
  if (creditAmount !== expectedCreditAmount) {
    throw Object.assign(new Error('订单算力额度与套餐配置不一致'), { code: 'PLAN_CREDIT_AMOUNT_INVALID' });
  }
  return billingRepo.createPaymentOrder({
    userId,
    provider,
    planId: pack?.id || plan.id,
    productId: pack?.id || plan.id,
    productType: normalizedProductType,
    amountMinor,
    currency,
    idempotencyKey: normalizedKey,
    billingCycle: normalizedCycle,
    creditAmount: expectedCreditAmount,
  });
}

export async function updateOrder(orderId, updates = {}) {
  return billingRepo.updateOrderFields(orderId, updates);
}

export async function getSubscription(userId) {
  return billingRepo.getActiveSubscription(userId);
}

export async function getEntitlements(userId) {
  const subscription = await getSubscription(userId);
  const isPaid = Boolean(subscription && ['active', 'trialing'].includes(subscription.status));
  const plan = await plansRepo.findPublicPlanById(isPaid ? subscription.plan_id : 'free');
  if (!plan) throw Object.assign(new Error('套餐目录尚未完成迁移或已被停用'), { code: 'PLAN_NOT_AVAILABLE' });
  const creditWallet = await getCreditWallet(userId);
  const currencyWallet = await getCurrencyWallet(userId);
  const credits = creditWallet ? creditWallet.totalAvailable : await getCreditBalance(userId);
  return {
    planId: isPaid ? plan.id : 'free',
    planName: plan.name,
    status: subscription?.status || 'free',
    provider: subscription?.provider || null,
    currentPeriodEnd: subscription?.current_period_end || null,
    features: plan.features,
    credits,
    creditBuckets: creditWallet || null,
    currencyWallet: currencyWallet || null,
    isPaidSubscription: isPaid,
    advanced: isPaid,
  };
}

/**
 * 向支付渠道发起原路退款。返回 { error } 表示未被受理，本地账本一律不动。
 */
async function requestProviderRefund({ order, amountMinor, reason }) {
  if (order.provider === 'stripe') {
    if (!order.provider_order_id) return { error: 'Stripe 订单缺少供应商支付标识，不能安全退款' };
    const stripe = getStripeProvider({ secret: await getStripeMerchantSecret() });
    const metadata = typeof order.metadata_json === 'string'
      ? (() => { try { return JSON.parse(order.metadata_json); } catch { return {}; } })()
      : (order.metadata_json || {});
    const session = metadata.invoiceId ? null : await stripe.retrievePayment(order.provider_order_id);
    const subscriptionId = metadata.stripeSubscriptionId || session?.subscription?.id || session?.subscription || null;
    if (subscriptionId) await stripe.cancel(subscriptionId);
    const paymentIntentId = order.provider_payment_id || session?.payment_intent;
    if (!paymentIntentId) return { error: 'Stripe 订单尚未关联可退款的支付意图' };
    const refundData = await stripe.refund({ paymentIntentId, idempotencyKey: `refund:${order.id}` });
    if (!(refundData?.id && ['succeeded', 'pending'].includes(refundData.status || 'succeeded'))) {
      return { error: 'Stripe 未确认退款请求' };
    }
    return { externalRefundId: refundData.id, providerNotice: 'Stripe 原路退款指令已提交，最终状态以 Webhook 对账为准' };
  }

  if (order.provider === 'wechat') {
    const wechat = await resolveWechatProvider();
    const data = await wechat.refund({
      outTradeNo: order.id,
      outRefundNo: `ref_${order.id}`,
      refundAmount: amountMinor,
      totalAmount: amountMinor,
      reason,
    });
    if (data?.mock) return { error: '微信支付商户凭证未配置，无法原路退款' };
    if (!data?.refund_id) return { error: '微信未确认退款请求' };
    return {
      externalRefundId: data.refund_id,
      providerNotice: `微信退款已受理（${data.status || 'PROCESSING'}），最终以退款回调对账`,
    };
  }

  if (order.provider === 'alipay') {
    const alipay = await resolveAlipayProvider();
    const refundNo = `ref_${order.id}`;
    const data = await alipay.refund({
      outTradeNo: order.id,
      outRequestNo: refundNo,
      refundAmountYuan: (amountMinor / 100).toFixed(2),
      reason,
    });
    if (data?.mock) return { error: '支付宝应用凭证未配置，无法原路退款' };
    // 支付宝业务失败已在网关层抛错，能返回即代表受理；退款单号沿用本地请求号。
    return { externalRefundId: data?.out_request_no || refundNo, providerNotice: '支付宝退款指令已受理，最终以对账结果为准' };
  }

  return { error: `${order.provider} 渠道不支持原路退款，请先在渠道商户后台手工退款` };
}

export async function processOrderRefund({ actor, orderId, reason, requestId }) {
  const order = await billingRepo.findOrderById(orderId);
  if (!order) return { error: '未找到对应订单' };

  if (order.status === 'refunded') {
    return { error: '该订单已处于退款状态' };
  }

  const refundAmountMinor = Number(order.amount_minor);
  if (!Number.isInteger(refundAmountMinor) || refundAmountMinor <= 0) {
    return { error: '订单缺少可退金额，不能发起退款' };
  }

  let externalRefundId = null;
  let providerNotice = null;

  // 1. 退款指令必须先被渠道受理，才允许把本地订单改成 refunded：
  //    只改库不调渠道会让用户看到「已退款」而钱根本没动。
  try {
    const accepted = await requestProviderRefund({ order, amountMinor: refundAmountMinor, reason });
    if (accepted.error) return { error: accepted.error };
    externalRefundId = accepted.externalRefundId;
    providerNotice = accepted.providerNotice;
  } catch (providerError) {
    console.error('[processOrderRefund]', { code: providerError.code || 'PROVIDER_ERROR' });
    return { error: publicErrorMessage(providerError, `${order.provider} 渠道退款失败`) };
  }

  // 2. 数据库事务：标记退款 + 记入不可变支付账本 + 同步取消订阅。
  const updatedOrder = await withTransaction(async (tx) => {
    const locked = await billingRepo.lockOrder(orderId, tx);
    if (!locked || !['paid', 'completed'].includes(locked.status)) return null;
    const now = nowIso();
    const updated = await billingRepo.markOrderRefundedInTransaction(orderId, now, tx);
    if (externalRefundId) {
      await billingRepo.insertPaymentRefundLedger({ order, provider: order.provider, eventId: `manual:${externalRefundId}`, externalRefundId, reason, transaction: tx });
    }
    await reversePaymentCredits({
      userId: order.user_id,
      referenceId: order.id,
      reason: reason || `订单 ${order.id} 退款`,
      idempotencyKey: `refund:${order.id}:credits`,
      transaction: tx,
    });
    await billingRepo.cancelMatchingSubscription({ userId: order.user_id, planId: order.plan_id, timestamp: now, transaction: tx });
    await logAudit({
      actor,
      action: 'orders.refund',
      targetType: 'order',
      targetId: orderId,
      riskLevel: 'high',
      before: { status: order.status, amount_minor: order.amount_minor },
      after: { status: 'refunded', reason, externalRefundId, providerNotice },
      requestId,
      transaction: tx,
    });
    return updated;
  });
  if (!updatedOrder) return { error: '订单状态已被其他请求变更，请刷新后重试' };

  return { order: updatedOrder, externalRefundId, providerNotice };
}

export async function updatePlanDetails({ actor, planId, name, monthlyCny, monthlyUsd, features, meta, yearlyCny, yearlyUsd, quotaBase, quotaBonus, concurrency, asyncConcurrency, portraitCapacity, badge, displayOrder, enabled, requestId }) {
  return await withTransaction(async (tx) => {
    const existing = await settingsRepo.findPlanConfigById(planId, tx);
    if (!existing) return { error: '目标套餐不存在' };

    const mergedMeta = {
      ...(existing.meta || {}),
      ...(meta || {}),
      ...(yearlyCny !== undefined ? { yearlyCny: Number(yearlyCny) } : {}),
      ...(yearlyUsd !== undefined ? { yearlyUsd: Number(yearlyUsd) } : {}),
      ...(quotaBase !== undefined ? { quotaBase: Number(quotaBase) } : {}),
      ...(quotaBonus !== undefined ? { quotaBonus: Number(quotaBonus) } : {}),
      ...(concurrency !== undefined ? { concurrency: Number(concurrency) } : {}),
      ...(asyncConcurrency !== undefined ? { asyncConcurrency: Number(asyncConcurrency) } : {}),
      ...(portraitCapacity !== undefined ? { portraitCapacity: Number(portraitCapacity) } : {}),
      ...(badge !== undefined ? { badge: String(badge) } : {}),
    };

    const updated = await settingsRepo.updatePlanConfig({
      id: planId,
      name: String(name || existing.name).trim(),
      monthlyCny: Number(monthlyCny ?? existing.monthly_cny),
      monthlyUsd: Number(monthlyUsd ?? existing.monthly_usd),
      features: Array.isArray(features) ? features : existing.features,
      meta: mergedMeta,
      displayOrder: Number(displayOrder ?? existing.display_order),
      enabled: Boolean(enabled !== undefined ? enabled : existing.enabled),
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'plans.update',
      targetType: 'plan',
      targetId: planId,
      riskLevel: 'medium',
      before: existing,
      after: updated,
      requestId,
      transaction: tx,
    });

    return { plan: updated };
  });
}
