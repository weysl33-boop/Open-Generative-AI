import 'server-only';

import { createOrder, updateOrder } from './billing.js';
import { getStripeProvider } from '../payments/stripeProvider.js';
import {
  assertPaymentChannelUsable,
  getStripeMerchantSecret,
  resolveAlipayProvider,
  resolveWechatProvider,
} from '../payments/providerCredentials.js';
import { recordProviderCall as persistProviderCall } from '../repositories/providers.js';
import { findPublicPlanById } from '../repositories/plans.js';
import { publicErrorMessage } from '../security/publicError.js';
import { findOrderById } from '../repositories/billing.js';
import { dispatchPaymentWebhook } from './webhookDispatcher.js';
import { getPlanCreditGrantAmount, normalizeBillingCycle } from '../payments/planFulfillment.js';
import { findCreditPackById } from '../payments/creditPacks.js';

function publicOrigin(request) {
  if (!request) return process.env.PUBLIC_APP_URL || 'https://www.koyosim.com';
  return process.env.PUBLIC_APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

async function recordProviderCall(call, orderId) {
  try {
    await persistProviderCall({ ...call, orderId });
  } catch (error) {
    console.error('[payment/provider-log]', { code: error.code || 'LOG_FAILED' });
  }
}

export async function createPaymentCheckout({ request, user, planId, productId, productType = 'subscription', provider = 'stripe', idempotencyKey, billingCycle = 'monthly' }) {
  const normalizedProductType = String(productType || 'subscription').trim().toLowerCase();
  if (!['subscription', 'credit_pack'].includes(normalizedProductType)) return { error: '不支持的购买类型', status: 400 };
  const plan = normalizedProductType === 'credit_pack'
    ? findCreditPackById(productId)
    : await findPublicPlanById(planId);
  const normalizedProvider = String(provider || '').toLowerCase();
  if (!plan || plan.id === 'free') return { error: '请选择付费方案', status: 400 };
  if (normalizedProductType === 'credit_pack' && !['wechat', 'alipay'].includes(normalizedProvider)) {
    return { error: '通用算力包目前仅支持人民币支付渠道', status: 400 };
  }

  let normalizedCycle;
  let creditAmount;
  try {
    normalizedCycle = normalizedProductType === 'credit_pack'
      ? normalizeBillingCycle('one_time', { productType: normalizedProductType })
      : normalizeBillingCycle(billingCycle, { productType: normalizedProductType });
    creditAmount = normalizedProductType === 'credit_pack' ? plan.credits : getPlanCreditGrantAmount(plan);
  } catch (error) {
    return { error: error.message || '该套餐暂不可购买', status: error.code === 'BILLING_CYCLE_UNAVAILABLE' ? 400 : 503 };
  }

  if (!['stripe', 'wechat', 'alipay'].includes(normalizedProvider)) {
    return { error: '不支持的支付渠道', status: 400 };
  }

  // 渠道没配齐时在创建订单之前就把请求挡掉：继续往下走会生成一张永远付不了的模拟二维码，
  // 还会留下一条用户扫不出、厂商也查不到的 pending 订单。
  const availability = await assertPaymentChannelUsable(normalizedProvider);
  if (!availability.ok) return { error: availability.error, status: availability.status };

  const isRmb = normalizedProductType === 'credit_pack' || normalizedProvider === 'wechat' || normalizedProvider === 'alipay';
  const currency = isRmb ? 'CNY' : 'USD';
  // 人民币金额以分为单位，美元以美分为单位；优先读取数据库套餐对应的币种计费字段
  const amountMinor = isRmb
    ? Math.round((Number(normalizedProductType === 'credit_pack' ? plan.priceCny : plan.monthlyCny) || (plan.monthlyUsd ? plan.monthlyUsd * 7 : 29)) * 100)
    : Math.round((Number(plan.monthlyUsd) || 9.9) * 100);
  if (!amountMinor || amountMinor <= 0) return { error: '该方案尚未设置价格', status: 400 };

  const created = await createOrder({
    userId: user.id,
    provider: normalizedProvider,
    plan,
    productType: normalizedProductType,
    productId: plan.id,
    amountMinor,
    currency,
    idempotencyKey,
    billingCycle: normalizedCycle,
    creditAmount,
  });
  const order = created.order;

  // 微信支付 Native V3 扫码
  if (normalizedProvider === 'wechat') {
    try {
      const wechat = await resolveWechatProvider({
        onCall: (call) => recordProviderCall(call, order.id),
      });
      const session = await wechat.createCheckout({ order, user, plan });
      await updateOrder(order.id, {
        provider_order_id: session.id,
        checkout_url: session.code_url,
      });
      return {
        orderId: order.id,
        qrCodeUrl: session.code_url,
        provider: 'wechat',
        amountYuan: (amountMinor / 100).toFixed(2),
        planName: plan.name,
        creditAmount,
        idempotent: created.idempotent,
      };
    } catch (error) {
      await updateOrder(order.id, { failure_code: error.code || 'WECHAT_ERROR' }).catch(() => {});
      return { error: publicErrorMessage(error, '微信支付下单失败，请稍后重试'), status: error.status || 502 };
    }
  }

  // 支付宝当面付 Precreate 扫码
  if (normalizedProvider === 'alipay') {
    try {
      const alipay = await resolveAlipayProvider({
        onCall: (call) => recordProviderCall(call, order.id),
      });
      const session = await alipay.createCheckout({ order, user, plan });
      await updateOrder(order.id, {
        provider_order_id: session.id,
        checkout_url: session.qr_code,
      });
      return {
        orderId: order.id,
        qrCodeUrl: session.qr_code,
        provider: 'alipay',
        amountYuan: (amountMinor / 100).toFixed(2),
        planName: plan.name,
        creditAmount,
        idempotent: created.idempotent,
      };
    } catch (error) {
      await updateOrder(order.id, { failure_code: error.code || 'ALIPAY_ERROR' }).catch(() => {});
      return { error: publicErrorMessage(error, '支付宝预下单失败，请稍后重试'), status: error.status || 502 };
    }
  }

  // Stripe 信用卡通道
  if (order.checkout_url) return { checkoutUrl: order.checkout_url, orderId: order.id, idempotent: true };
  try {
    const secret = await getStripeMerchantSecret();
    const stripe = getStripeProvider({ secret, onCall: (call) => recordProviderCall(call, order.id) });
    const session = await stripe.createCheckout({
      order,
      user,
      plan,
      successUrl: `${publicOrigin(request)}/account?checkout=success`,
      cancelUrl: `${publicOrigin(request)}/account?checkout=cancelled`,
    });
    if (!session?.id || !session?.url) return { error: 'Stripe 暂时无法创建收款页面', status: 502 };
    await updateOrder(order.id, { provider_order_id: session.id, checkout_url: session.url });
    return { checkoutUrl: session.url, orderId: order.id, idempotent: created.idempotent };
  } catch (error) {
    await updateOrder(order.id, { failure_code: error.code || 'PROVIDER_ERROR' }).catch(() => {});
    return { error: publicErrorMessage(error, 'Stripe 暂时无法创建收款页面'), status: error.status || 502 };
  }
}

/**
 * 查询并同步订单支付状态（支持前端主动轮询，并在未收到 Webhook 时主动向上游查单）
 */
export async function syncOrderPaymentStatus(orderId, userId) {
  const order = await findOrderById(orderId);
  if (!order) return { error: '订单不存在', status: 404 };
  if (userId && order.user_id !== userId) return { error: '无权查看该订单', status: 403 };

  // 已核销直接返回
  if (order.status === 'paid' || order.status === 'refunded') {
    return {
      orderId: order.id,
      status: order.status,
      paidAt: order.paid_at,
      planId: order.plan_id,
      amountMinor: order.amount_minor,
      currency: order.currency,
    };
  }

  // 若仍处于 pending，主动向上游查单同步
  try {
    if (order.provider === 'wechat') {
      const wechat = await resolveWechatProvider();
      const checkResult = await wechat.retrievePayment(order.id);
      if (checkResult.paid) {
        // 主动触发履约核销。事件 ID 与微信到账通知的取法保持一致：查单先跑还是通知先到，
        // 台账都只认一笔到账；金额也不回填订单原价，否则「厂商没报金额」会被伪装成「金额一致」。
        await dispatchPaymentWebhook({
          provider: 'wechat',
          event: {
            id: `wx_${checkResult.transactionId || order.id}`,
            type: 'TRANSACTION.SUCCESS',
            kind: 'payment',
            out_trade_no: order.id,
            transaction_id: checkResult.transactionId || null,
            amount_total: checkResult.amountTotal,
            currency: 'CNY',
            createdAt: checkResult.successTime || null,
          },
        });
        const refreshed = await findOrderById(order.id);
        return {
          orderId: refreshed.id,
          status: refreshed.status,
          paidAt: refreshed.paid_at,
          planId: refreshed.plan_id,
        };
      }
    } else if (order.provider === 'alipay') {
      const alipay = await resolveAlipayProvider();
      const checkResult = await alipay.retrievePayment(order.id);
      if (checkResult.paid) {
        // 主动触发履约核销
        await dispatchPaymentWebhook({
          provider: 'alipay',
          event: {
            id: `alipay_${checkResult.transactionId || order.id}`,
            type: checkResult.tradeStatus || 'TRADE_SUCCESS',
            kind: 'payment',
            out_trade_no: order.id,
            trade_no: checkResult.transactionId || null,
            amount_total: checkResult.amountTotal,
            currency: 'CNY',
            createdAt: checkResult.sendPayDate || null,
          },
        });
        const refreshed = await findOrderById(order.id);
        return {
          orderId: refreshed.id,
          status: refreshed.status,
          paidAt: refreshed.paid_at,
          planId: refreshed.plan_id,
        };
      }
    }
  } catch (err) {
    console.warn('[payment/sync-status]', { orderId, code: err.code || 'SYNC_FAILED' });
  }

  return {
    orderId: order.id,
    status: order.status,
    planId: order.plan_id,
    amountMinor: order.amount_minor,
    currency: order.currency,
  };
}
