import 'server-only';

import { execute, nowIso } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as billingRepo from '../repositories/billing.js';
import * as settingsRepo from '../repositories/settings.js';

export async function processOrderRefund({ actor, orderId, reason, requestId }) {
  const order = await billingRepo.findOrderById(orderId);
  if (!order) return { error: '未找到对应订单' };

  if (order.status === 'refunded') {
    return { error: '该订单已处于退款状态' };
  }

  let externalRefundId = null;
  let providerNotice = null;

  // 1. 若为 Stripe 订单且具备商户密钥，调用上游真实退款
  if (order.provider === 'stripe' && process.env.STRIPE_SECRET_KEY && order.provider_order_id) {
    try {
      const secret = process.env.STRIPE_SECRET_KEY;
      // 若是以 cs_ 开头的 Checkout Session，先拉取其关联的 payment_intent
      let paymentIntentId = order.provider_order_id;
      if (order.provider_order_id.startsWith('cs_')) {
        const sessionRes = await fetch(`https://api.stripe.com/v1/checkout/sessions/${order.provider_order_id}`, {
          headers: { Authorization: `Bearer ${secret}` },
        });
        const sessionData = await sessionRes.json();
        if (sessionData?.payment_intent) {
          paymentIntentId = sessionData.payment_intent;
        }
      }

      if (paymentIntentId && paymentIntentId.startsWith('pi_')) {
        const refundParams = new URLSearchParams();
        refundParams.set('payment_intent', paymentIntentId);
        if (reason) refundParams.set('reason', 'requested_by_customer');

        const refundRes = await fetch('https://api.stripe.com/v1/refunds', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: refundParams,
        });
        const refundData = await refundRes.json();
        if (refundRes.ok && refundData.id) {
          externalRefundId = refundData.id;
          providerNotice = 'Stripe 原路退款指令已成功提交';
        } else {
          console.warn('[processOrderRefund] Stripe 退款警告:', refundData?.error?.message);
          providerNotice = `Stripe 退款提示: ${refundData?.error?.message || '需人工上商户后台确认'}`;
        }
      }
    } catch (stripeErr) {
      console.error('[processOrderRefund] Stripe 退款网络异常:', stripeErr);
      providerNotice = `上游通信异常: ${stripeErr.message}`;
    }
  }

  // 2. 数据库事务：标记退款 + 同步取消该用户此方案的有效订阅（防止资损）
  const updatedOrder = await billingRepo.markOrderRefunded(orderId, reason);

  try {
    await execute(`
      UPDATE subscriptions
      SET status = 'canceled', updated_at = $1
      WHERE user_id = $2 AND plan_id = $3 AND status IN ('active', 'trialing')
    `, [nowIso(), order.user_id, order.plan_id]);
  } catch {}

  await logAudit({
    actor,
    action: 'orders.refund',
    targetType: 'order',
    targetId: orderId,
    riskLevel: 'high',
    before: { status: order.status, amount_minor: order.amount_minor },
    after: { status: 'refunded', reason, externalRefundId, providerNotice },
    requestId,
  });

  return { order: updatedOrder, externalRefundId, providerNotice };
}

export async function updatePlanDetails({ actor, planId, name, monthlyCny, monthlyUsd, features, displayOrder, enabled, requestId }) {
  const existing = await settingsRepo.findPlanConfigById(planId);
  if (!existing) return { error: '目标套餐不存在' };

  const updated = await settingsRepo.updatePlanConfig({
    id: planId,
    name: String(name || existing.name).trim(),
    monthlyCny: Number(monthlyCny ?? existing.monthly_cny),
    monthlyUsd: Number(monthlyUsd ?? existing.monthly_usd),
    features: Array.isArray(features) ? features : existing.features,
    displayOrder: Number(displayOrder ?? existing.display_order),
    enabled: Boolean(enabled !== undefined ? enabled : existing.enabled),
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
  });

  return { plan: updated };
}
