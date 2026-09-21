import { findPublicPlanByIdTx } from '../repositories/plans.js';
import { nowIso, withTransaction } from '../db/index.js';
import { grantPerpetualCredits, reversePaymentCredits } from '../financial/creditService.js';
import { logAudit } from '../admin/audit.js';
import * as webhookRepo from '../repositories/webhooks.js';
import { getOrderProductType, resolveOrderCreditGrantAmount } from '../payments/planFulfillment.js';

function eventTime(event) {
  if (event?.created) return new Date(Number(event.created) * 1000).toISOString();
  const raw = event?.createdAt;
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function stripeObjectId(value) {
  if (typeof value === 'string') return value;
  return value && typeof value === 'object' && typeof value.id === 'string' ? value.id : null;
}

function stripeSubscriptionInvoiceMetadata(invoice) {
  return invoice?.parent?.subscription_details?.metadata
    || invoice?.subscription_details?.metadata
    || {};
}

function stripeSubscriptionInvoiceId(invoice) {
  return stripeObjectId(invoice?.parent?.subscription_details?.subscription || invoice?.subscription);
}

function stripeInvoicePaymentIntentId(invoice) {
  const legacyId = stripeObjectId(invoice?.payment_intent);
  if (legacyId) return legacyId;
  const payments = Array.isArray(invoice?.payments?.data) ? invoice.payments.data : [];
  const paidIntent = payments.find((payment) => payment?.status === 'paid'
    && payment?.payment?.type === 'payment_intent');
  return stripeObjectId(paidIntent?.payment?.payment_intent);
}

/**
 * 厂商报来的金额必须与订单一致才允许履约。
 * 不一致时报文再真也是一笔对不上账的钱：让订单留在未支付状态、事件落 failed 并由人工裁决，
 * 绝不能按厂商给的金额直接发额度。
 */
export function reconcileAmount({ claimed, currency, order, field }) {
  const expected = Number(order?.amount_minor);
  if (!Number.isFinite(expected) || expected <= 0) return { ok: false, reason: 'order_amount_unavailable' };
  const paid = Number(claimed);
  if (!Number.isFinite(paid) || paid <= 0) return { ok: false, reason: `${field}_missing` };
  if (paid !== expected) return { ok: false, reason: `${field}_mismatch:${paid}!=${expected}` };
  const orderCurrency = String(order.currency || '').toUpperCase();
  const claimedCurrency = String(currency || '').toUpperCase();
  if (orderCurrency && claimedCurrency && orderCurrency !== claimedCurrency) {
    return { ok: false, reason: `currency_mismatch:${claimedCurrency}!=${orderCurrency}` };
  }
  return { ok: true, amountMinor: expected, currency: orderCurrency || claimedCurrency || 'USD' };
}

async function rejectAmountMismatch({ tx, provider, order, reason, claimed }) {
  await logAudit({
    actor: { id: `system:${provider}-webhook`, email: 'system@koyosim.local' },
    action: 'payments.amount_mismatch',
    targetType: 'order',
    targetId: order.id,
    riskLevel: 'high',
    after: { provider, orderId: order.id, claimedAmountMinor: Number(claimed) || null, expectedAmountMinor: Number(order.amount_minor) || null, reason },
    transaction: tx,
  });
  return { success: false, retryable: false, action: 'payment_amount_mismatch', error: reason, orderId: order.id };
}

export function reconcileRefundAmount({ claimed, currency, order }) {
  const expected = Number(order?.amount_minor);
  const refund = Number(claimed);
  if (!Number.isInteger(refund) || refund <= 0) return { ok: false, reason: 'refund_amount_missing' };
  if (Number.isInteger(expected) && expected > 0 && refund > expected) return { ok: false, reason: `refund_exceeds_order:${refund}>${expected}` };
  const orderCurrency = String(order?.currency || '').toUpperCase();
  const claimedCurrency = String(currency || '').toUpperCase();
  if (orderCurrency && claimedCurrency && orderCurrency !== claimedCurrency) {
    return { ok: false, reason: `currency_mismatch:${claimedCurrency}!=${orderCurrency}` };
  }
  return { ok: true, amountMinor: refund, fullyRefunded: Number.isInteger(expected) && expected > 0 && refund >= expected };
}

async function syncSubscription({ tx, userId, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, eventCreatedAt }) {
  return webhookRepo.syncStripeSubscription({ tx, userId, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, eventCreatedAt, transaction: tx });
}

async function fulfillStripeRenewalInvoice(event, invoice, tx) {
  if (invoice.status !== 'paid' || invoice.paid_out_of_band === true
    || !Number.isSafeInteger(Number(invoice.amount_paid)) || Number(invoice.amount_paid) <= 0) {
    return { success: true, action: 'invoice_not_paid' };
  }
  // 首次订阅付款仍由 checkout.session.completed 核销；续期只处理完整月度账单，
  // proration/套餐变更等账单在单独履约规则上线前一律不发额度。
  if (invoice.billing_reason !== 'subscription_cycle') {
    return { success: true, action: 'invoice_reason_not_supported' };
  }

  const invoiceId = stripeObjectId(invoice.id);
  const subscriptionId = stripeSubscriptionInvoiceId(invoice);
  const metadata = stripeSubscriptionInvoiceMetadata(invoice);
  if (!invoiceId || !subscriptionId || !metadata.order_id || !metadata.user_id || !metadata.plan_id) {
    return { success: false, retryable: false, action: 'renewal_metadata_missing', error: 'Stripe 续期账单缺少平台订阅元数据' };
  }

  const baseOrder = await webhookRepo.lockOrderInTransaction(metadata.order_id, tx);
  if (!baseOrder) throw Object.assign(new Error('Stripe 续期账单对应的基础订单不存在'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
  if (baseOrder.provider !== 'stripe' || baseOrder.user_id !== metadata.user_id || baseOrder.plan_id !== metadata.plan_id) {
    throw Object.assign(new Error('Stripe 续期账单与平台订单归属不一致'), { code: 'PAYMENT_ORDER_METADATA_MISMATCH' });
  }
  if (baseOrder.status === 'refunded') {
    return { success: false, retryable: false, action: 'renewal_base_order_refunded', error: '已退款的订阅订单不能继续发放续期额度' };
  }
  if (baseOrder.status !== 'paid') {
    throw Object.assign(new Error('Stripe 续期账单早于基础订单到账，等待基础支付事件重试'), { code: 'STRIPE_RENEWAL_BASE_ORDER_NOT_PAID' });
  }

  const existingMetadata = typeof baseOrder.metadata_json === 'string'
    ? (() => { try { return JSON.parse(baseOrder.metadata_json); } catch { return {}; } })()
    : (baseOrder.metadata_json || {});
  if (existingMetadata.stripeSubscriptionId && existingMetadata.stripeSubscriptionId !== subscriptionId) {
    throw Object.assign(new Error('Stripe 续期账单关联到另一条订阅'), { code: 'STRIPE_SUBSCRIPTION_MISMATCH' });
  }

  const plan = await findPublicPlanByIdTx(tx, baseOrder.plan_id);
  if (!plan) throw Object.assign(new Error('Stripe 续期套餐已不可用'), { code: 'PAYMENT_PLAN_NOT_FOUND' });
  const creditAmount = resolveOrderCreditGrantAmount({ order: baseOrder, plan });
  const reconciled = reconcileAmount({ claimed: invoice.amount_paid, currency: invoice.currency, order: baseOrder, field: 'amount_paid' });
  if (!reconciled.ok) return rejectAmountMismatch({ tx, provider: 'stripe', order: baseOrder, reason: reconciled.reason, claimed: invoice.amount_paid });

  const periodEndSeconds = Number(invoice.period_end);
  if (!Number.isSafeInteger(periodEndSeconds) || periodEndSeconds <= 0) {
    throw Object.assign(new Error('Stripe 续期账单缺少有效服务周期结束时间'), { code: 'STRIPE_INVOICE_PERIOD_MISSING' });
  }

  const created = await webhookRepo.createStripeRenewalOrderInTransaction({
    invoiceId,
    stripeSubscriptionId: subscriptionId,
    baseOrder,
    amountMinor: reconciled.amountMinor,
    currency: reconciled.currency,
    creditAmount,
    providerPaymentId: stripeInvoicePaymentIntentId(invoice),
    transaction: tx,
  });
  const renewalOrder = created.order;
  const ledgerInserted = await webhookRepo.recordPaymentSuccess({
    eventId: event.id,
    order: renewalOrder,
    userId: baseOrder.user_id,
    amountMinor: reconciled.amountMinor,
    currency: reconciled.currency,
    providerPaymentId: stripeInvoicePaymentIntentId(invoice),
    payload: { id: invoiceId, type: event.type, billing_reason: invoice.billing_reason },
    transaction: tx,
  });
  await webhookRepo.markOrderPaid({
    orderId: renewalOrder.id,
    providerOrderId: invoiceId,
    providerPaymentId: stripeInvoicePaymentIntentId(invoice),
    providerCustomerId: stripeObjectId(invoice.customer),
    paidAmountMinor: reconciled.amountMinor,
    payload: { id: invoiceId, type: event.type, billing_reason: invoice.billing_reason },
    timestamp: nowIso(),
    transaction: tx,
  });

  const currentPeriodEnd = new Date(periodEndSeconds * 1000).toISOString();
  if (renewalOrder.status !== 'refunded') {
    await syncSubscription({
      tx,
      userId: baseOrder.user_id,
      providerCustomerId: stripeObjectId(invoice.customer),
      providerSubscriptionId: subscriptionId,
      planId: plan.id,
      status: 'active',
      currentPeriodEnd,
      eventCreatedAt: eventTime(event),
    });
  }
  if (ledgerInserted && renewalOrder.status !== 'refunded') {
    await grantPerpetualCredits(
      baseOrder.user_id,
      creditAmount,
      `Stripe 续期发票 ${invoiceId} 额度发放`,
      renewalOrder.id,
      `payment:${renewalOrder.id}:credits`,
      tx,
    );
  }
  return { success: true, action: ledgerInserted ? 'subscription_renewal_recorded' : 'subscription_renewal_already_recorded', orderId: renewalOrder.id, creditAmount };
}

async function dispatchStripeEventInTransaction(event, tx) {
  if (!event || typeof event.type !== 'string') return { success: false, error: '事件对象为空' };
  const object = event.data?.object || {};
  const metadata = object.metadata || {};
  const userId = metadata.user_id;
  const eventCreatedAt = eventTime(event);

  if (event.type === 'invoice.paid') {
    return fulfillStripeRenewalInvoice(event, object, tx);
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (!userId || !metadata.order_id) return { success: true, action: 'ignored_invalid_metadata' };
    if (object.payment_status !== 'paid') return { success: true, action: 'payment_not_complete' };
    const user = await webhookRepo.findUserInTransaction(userId, tx);
    if (!user) throw Object.assign(new Error('支付事件对应用户不存在，等待人工修复后重试'), { code: 'PAYMENT_USER_NOT_FOUND' });
    const order = metadata.order_id
      ? await webhookRepo.lockOrderInTransaction(metadata.order_id, tx)
      : null;
    if (metadata.order_id && !order) throw Object.assign(new Error('支付事件对应订单不存在，等待订单同步后重试'), { code: 'PAYMENT_ORDER_NOT_FOUND' });
    if (order.user_id !== userId || (metadata.plan_id && metadata.plan_id !== order.plan_id)) {
      throw Object.assign(new Error('Stripe 事件与服务端订单归属不一致，拒绝履约'), { code: 'PAYMENT_ORDER_METADATA_MISMATCH' });
    }
    const stripeSubscriptionId = stripeObjectId(object.subscription);
    if (stripeSubscriptionId) {
      await webhookRepo.mergeOrderMetadataInTransaction(order.id, { stripeSubscriptionId }, tx);
    }
    const productType = getOrderProductType(order);
    const plan = productType === 'credit_pack' ? null : await findPublicPlanByIdTx(tx, order.plan_id);
    if (productType === 'subscription' && !plan) {
      throw Object.assign(new Error('支付订单对应套餐不存在，等待修复后重试'), { code: 'PAYMENT_PLAN_NOT_FOUND' });
    }
    if (productType === 'credit_pack' && stripeSubscriptionId) {
      throw Object.assign(new Error('一次性算力包订单不能绑定 Stripe 自动续费'), { code: 'CREDIT_PACK_SUBSCRIPTION_MISMATCH' });
    }

    let ledgerInserted = null;
    if (order) {
      const reconciled = reconcileAmount({ claimed: object.amount_total, currency: object.currency, order, field: 'amount_total' });
      if (!reconciled.ok) return rejectAmountMismatch({ tx, provider: 'stripe', order, reason: reconciled.reason, claimed: object.amount_total });
      ledgerInserted = await webhookRepo.recordPaymentSuccess({ eventId: event.id, order, userId, amountMinor: reconciled.amountMinor, currency: reconciled.currency, providerPaymentId: object.payment_intent || null, payload: { id: object.id, type: event.type, created: event.created || null }, transaction: tx });
      await webhookRepo.markOrderPaid({ orderId: order.id, providerOrderId: object.id || null, providerPaymentId: object.payment_intent || null, providerCustomerId: object.customer || null, paidAmountMinor: reconciled.amountMinor, payload: { id: object.id, type: event.type, payment_status: object.payment_status || null }, timestamp: nowIso(), transaction: tx });
    }

    const creditAmount = resolveOrderCreditGrantAmount({ order, plan });
    if (ledgerInserted && order?.status !== 'refunded' && Number.isInteger(creditAmount) && creditAmount > 0) {
      await grantPerpetualCredits(userId, creditAmount, `Stripe 订单 ${order?.id || object.id} 额度发放`, order?.id || object.id, `payment:${order?.id || object.id}:credits`, tx);
    }
    return { success: true, action: ledgerInserted ? 'payment_recorded' : 'payment_already_recorded' };
  }

  if (event.type === 'payment_intent.payment_failed') {
    const order = metadata.order_id ? await webhookRepo.lockOrderInTransaction(metadata.order_id, tx) : null;
    if (!order) return { success: false, action: 'payment_failure_waiting_for_order', retryable: true };
    if (!['paid', 'refunded'].includes(order.status)) {
      await webhookRepo.markOrderPaymentFailed({ orderId: order.id, providerPaymentId: object.id || null, failureCode: 'PAYMENT_FAILED', timestamp: nowIso(), transaction: tx });
    }
    return { success: true, action: 'payment_failure_recorded' };
  }

  if (event.type === 'charge.refunded' || event.type === 'refund.updated') {
    const paymentIntentId = object.payment_intent || object.id;
    const order = await webhookRepo.lockOrderByProviderPaymentInTransaction(paymentIntentId, tx);
    if (!order) return { success: false, action: 'refund_waiting_for_order', retryable: true };
    const inserted = await webhookRepo.recordPaymentRefund({ eventId: event.id, order, paymentIntentId, amountMinor: Number(object.amount_refunded || object.amount || order.amount_minor || 0), currency: String(object.currency || order.currency || 'usd').toUpperCase(), payload: { id: object.id, type: event.type }, transaction: tx });
    if (inserted) {
      await webhookRepo.markOrderRefundedFromWebhook(order.id, nowIso(), tx);
      await reversePaymentCredits({
        userId: order.user_id,
        referenceId: order.id,
        reason: `Stripe 订单 ${order.id} 退款`,
        idempotencyKey: `payment:${event.id}:credits_refund`,
        transaction: tx,
      });
    }
    return { success: true, action: inserted ? 'refund_recorded' : 'refund_already_recorded' };
  }

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const plan = await findPublicPlanByIdTx(tx, metadata.plan_id);
    if (!userId || !plan || !object.id) return { success: true, action: 'ignored_invalid_subscription_metadata' };
    const user = await webhookRepo.findUserInTransaction(userId, tx);
    if (!user) throw Object.assign(new Error('订阅事件对应用户不存在，等待人工修复后重试'), { code: 'PAYMENT_USER_NOT_FOUND' });
    await syncSubscription({
      tx, userId, planId: plan.id, providerCustomerId: object.customer || null, providerSubscriptionId: object.id,
      status: event.type.endsWith('.deleted') ? 'canceled' : object.status || 'active',
      currentPeriodEnd: object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null,
      eventCreatedAt,
    });
    return { success: true, action: 'subscription_synced' };
  }

  return { success: true, action: 'ignored_unhandled_type', type: event.type };
}

export async function dispatchStripeEvent(event, { transaction = null } = {}) {
  if (transaction) return dispatchStripeEventInTransaction(event, transaction);
  return withTransaction((tx) => dispatchStripeEventInTransaction(event, tx));
}

/**
 * 入站回调的统一外壳：台账去重 -> 渠道履约 -> 状态回写 -> 审计。
 * dispatch 返回 retryable 时事件保持可重试，不吞掉厂商通知。
 */
export const WEBHOOK_RETRY = Object.freeze({
  baseMs: 60_000,
  maxMs: 6 * 60 * 60 * 1000,
  staleMs: Number(process.env.WEBHOOK_RETRY_STALE_MS) || 10 * 60 * 1000,
  maxAttempts: Number(process.env.WEBHOOK_RETRY_MAX_ATTEMPTS) || 12,
});

/**
 * 指数退避：前几次密集重试扛住瞬时故障（订单尚未同步、数据库抖动），
 * 之后拉长间隔，避免一条坏事件把常驻 worker 拖成热循环。
 */
export function webhookRetryAt({ attempts = 1, now = Date.now() } = {}) {
  const step = Math.min(10, Math.max(0, Number(attempts) - 1));
  const delay = Math.min(WEBHOOK_RETRY.maxMs, WEBHOOK_RETRY.baseMs * 2 ** step);
  return new Date(now + delay).toISOString();
}

async function handleInboundWebhookEvent({ provider, event, headers = null, force = false, dispatch }) {
  let attempts = 1;
  try {
    return await withTransaction(async (tx) => {
      const now = nowIso();
      const claimed = await webhookRepo.claimWebhookEvent({ provider, eventId: event.id, eventType: event.type, eventCreatedAt: eventTime(event), payload: event, headers, timestamp: now, transaction: tx });
      if (!claimed) {
        const existing = await webhookRepo.getWebhookEventForUpdate(event.id, tx, provider);
        attempts = Number(existing?.attempts || 1);
        if (!force && existing?.status !== 'failed' && existing?.status !== 'replay_failed') return { duplicate: true, action: 'duplicate_ignored' };
        await webhookRepo.markWebhookReceived(event.id, now, tx, provider);
      }
      const result = await dispatch(event, tx);
      const rejected = result.success === false && !result.retryable;
      if (result.retryable) {
        await webhookRepo.markWebhookFailed(event.id, `${result.action || result.error || 'webhook_pending'}，等待上游重试`, webhookRetryAt({ attempts: attempts + 1 }), tx, provider);
      } else if (rejected) {
        // 重推也不会变好的失败（金额对不上、报文缺订单号）：置 failed 但不排自动重试，交人工裁决。
        await webhookRepo.markWebhookFailed(event.id, `${result.action || 'webhook_rejected'}：${result.error || '履约被拒绝'}`, null, tx, provider);
      } else {
        await webhookRepo.markWebhookProcessed(event.id, now, tx, provider);
      }
      const outcome = result.retryable ? 'retryable' : rejected ? 'rejected' : 'processed';
      await logAudit({ actor: { id: `system:${provider}-webhook`, email: 'system@koyosim.local' }, action: `payments.webhook_${outcome}`, targetType: 'webhook_event', targetId: event.id, riskLevel: outcome === 'processed' ? 'low' : 'medium', after: { provider, eventType: event.type, action: result.action, duplicate: false, retryable: Boolean(result.retryable), error: result.error || null }, transaction: tx });
      return { ...result, duplicate: false };
    });
  } catch (error) {
    await webhookRepo.markWebhookFailedAfterRollback({
      eventId: event.id,
      errorCode: String(error.code || 'WEBHOOK_ERROR').slice(0, 120),
      retryAt: webhookRetryAt({ attempts: attempts + 1 }),
      provider,
    }).catch(() => {});
    throw error;
  }
}

export async function handleStripeWebhookEvent({ event, headers = null, force = false }) {
  return handleInboundWebhookEvent({ provider: 'stripe', event, headers, force, dispatch: dispatchStripeEventInTransaction });
}

/**
 * 微信支付与支付宝「当面付」的履约内核：订单核销、额度发放、会员续期。
 */
async function fulfillNativePaymentEvent({ provider, event, tx }) {
  const orderId = event.out_trade_no || event.orderId;
  const now = nowIso();

  const order = await webhookRepo.lockOrderInTransaction(orderId, tx);
  if (!order) {
    return { success: false, retryable: true, action: 'payment_waiting_for_order', error: '订单不存在', orderId };
  }

  // 幂等保护：已支付则直接返回成功
  if (order.status === 'paid') {
    return { success: true, action: 'already_paid', orderId };
  }

  const providerPaymentId = event.transaction_id || event.trade_no || event.providerPaymentId || null;
  const claimedMinor = event.amount_total ?? event.total_amount_minor;
  const reconciled = reconcileAmount({ claimed: claimedMinor, currency: event.currency || order.currency, order, field: 'amount_total' });
  if (!reconciled.ok) return rejectAmountMismatch({ tx, provider, order, reason: reconciled.reason, claimed: claimedMinor });
  const amountMinor = reconciled.amountMinor;
  const currency = reconciled.currency;

  // 记录支付流水
  const ledgerInserted = await webhookRepo.recordPaymentSuccess({
    provider,
    eventId: event.id,
    order,
    userId: order.user_id,
    amountMinor,
    currency,
    providerPaymentId,
    payload: event,
    transaction: tx,
  });

  // 标记订单为已支付
  await webhookRepo.markOrderPaid({
    orderId: order.id,
    providerOrderId: order.provider_order_id || null,
    providerPaymentId,
    providerCustomerId: order.user_id,
    paidAmountMinor: amountMinor,
    payload: event,
    timestamp: now,
    transaction: tx,
  });

  // 会员套餐从数据库目录读取；通用算力包只按服务端订单快照履约。
  const productType = getOrderProductType(order);
  const plan = productType === 'credit_pack' ? null : await findPublicPlanByIdTx(tx, order.plan_id);
  if (productType === 'subscription' && !plan) {
    throw Object.assign(new Error('支付订单对应套餐不存在，等待修复后重试'), { code: 'PAYMENT_PLAN_NOT_FOUND' });
  }
  const creditAmount = resolveOrderCreditGrantAmount({ order, plan });

  // 会员身份履约：为用户在数据库中正式开通/续期会员订阅（Pro 或 Team）
  if (productType === 'subscription' && order.plan_id && order.plan_id !== 'free') {
    const periodDays = 31; // 默认 31 天订阅期
    const periodEnd = new Date(Date.now() + periodDays * 24 * 3600 * 1000).toISOString();
    await webhookRepo.syncPaymentSubscription({
      userId: order.user_id,
      provider,
      providerCustomerId: order.user_id,
      providerSubscriptionId: order.id,
      planId: order.plan_id,
      status: 'active',
      currentPeriodEnd: periodEnd,
      eventCreatedAt: now,
      transaction: tx,
    });
  }

  if (ledgerInserted && creditAmount > 0) {
    await grantPerpetualCredits(
      order.user_id,
      creditAmount,
      `${provider === 'wechat' ? '微信支付' : '支付宝'} 订单 ${order.id} 到账`,
      order.id,
      `payment:${order.id}:credits`,
      tx
    );
  }

  await logAudit({
    actor: { id: `system:${provider}-webhook`, email: `system@${provider}.local` },
    action: 'payments.native_qr_paid',
    targetType: 'order',
    targetId: order.id,
    riskLevel: 'low',
    after: { provider, orderId: order.id, creditAmount, amountMinor },
    transaction: tx,
  });

  return { success: true, action: ledgerInserted ? 'payment_recorded' : 'payment_already_recorded', orderId: order.id, creditAmount };
}

/**
 * 厂商通知分「到账」与「退款」两类履约。kind 由路由按厂商事件类型给定，
 * 台账重放时从 payload 读取，因此也接受按 event.type 兜底判断。
 */
export function nativeEventKind(event) {
  const kind = String(event?.kind || '').toLowerCase();
  if (kind) return kind === 'refund' ? 'refund' : 'payment';
  return String(event?.type || '').toUpperCase().includes('REFUND') ? 'refund' : 'payment';
}

/**
 * 微信/支付宝退款通知的履约：只回冲本地账本、订单状态与额度，绝不向厂商再发起退款。
 * 部分退款保留订单已支付状态（额度是否收回交人工判断），只有覆盖整单的退款才回冲。
 */
async function fulfillNativeRefundEvent({ provider, event, tx }) {
  const orderId = event.out_trade_no || event.orderId;
  const order = await webhookRepo.lockOrderInTransaction(orderId, tx);
  if (!order) return { success: false, retryable: true, action: 'refund_waiting_for_order', error: '订单不存在', orderId };

  const reconciled = reconcileRefundAmount({ claimed: event.refund_amount_minor, currency: event.currency, order });
  if (!reconciled.ok) return rejectAmountMismatch({ tx, provider, order, reason: reconciled.reason, claimed: event.refund_amount_minor });

  const providerRefundId = event.refund_id || event.out_refund_no || null;
  if (order.status === 'refunded') {
    // 管理员发起的退款已经入过账：厂商确认再补一条 payment_refund，同一笔真实退款就会被算两次。
    await logAudit({
      actor: { id: `system:${provider}-webhook`, email: `system@${provider}.local` },
      action: 'payments.native_qr_refund_confirmed',
      targetType: 'order',
      targetId: order.id,
      riskLevel: 'low',
      after: { provider, orderId: order.id, providerRefundId, eventId: event.id },
      transaction: tx,
    });
    return { success: true, action: 'refund_confirmed_for_refunded_order', orderId: order.id };
  }

  const inserted = await webhookRepo.recordPaymentRefund({
    provider,
    eventId: event.id,
    order,
    paymentIntentId: providerRefundId || event.transaction_id || event.trade_no || null,
    amountMinor: reconciled.amountMinor,
    currency: String(event.currency || order.currency || 'CNY').toUpperCase(),
    payload: event,
    transaction: tx,
  });
  if (!inserted) return { success: true, action: 'refund_already_recorded', orderId: order.id };

  if (reconciled.fullyRefunded) {
    await webhookRepo.markOrderRefundedFromWebhook(order.id, nowIso(), tx);
    await reversePaymentCredits({
      userId: order.user_id,
      referenceId: order.id,
      reason: `${provider === 'wechat' ? '微信支付' : '支付宝'} 订单 ${order.id} 退款`,
      idempotencyKey: `payment:${event.id}:credits_refund`,
      transaction: tx,
    });
  }

  await logAudit({
    actor: { id: `system:${provider}-webhook`, email: `system@${provider}.local` },
    action: 'payments.native_qr_refunded',
    targetType: 'order',
    targetId: order.id,
    riskLevel: reconciled.fullyRefunded ? 'medium' : 'high',
    after: { provider, orderId: order.id, refundAmountMinor: reconciled.amountMinor, fullyRefunded: reconciled.fullyRefunded, providerRefundId },
    transaction: tx,
  });

  return { success: true, action: reconciled.fullyRefunded ? 'refund_recorded' : 'partial_refund_recorded', orderId: order.id, fullyRefunded: reconciled.fullyRefunded };
}

/**
 * 统一处理微信支付与支付宝的履约回调，并纳入 webhook 台账去重。
 */
export async function dispatchPaymentWebhook({ provider, event, headers = null, force = false }) {
  const normalizedProvider = String(provider || '').toLowerCase();
  if (!event?.id) {
    return { success: false, error: '回调缺少事件 ID，无法去重' };
  }
  if (!event.out_trade_no && !event.orderId) {
    return { success: false, error: '缺少订单号 out_trade_no' };
  }
  const kind = nativeEventKind(event);
  const dispatch = kind === 'refund' ? fulfillNativeRefundEvent : fulfillNativePaymentEvent;

  return handleInboundWebhookEvent({
    provider: normalizedProvider,
    event,
    headers,
    force,
    dispatch: (evt, tx) => dispatch({ provider: normalizedProvider, event: evt, tx }),
  });
}

export async function replayWebhookEvent({ actor, eventId, requestId, provider = 'stripe' }) {
  const event = await webhookRepo.findWebhookEvent(eventId, provider);
  if (!event) return { error: 'NOT_FOUND' };
  let result;
  let replayError = null;
  try {
    const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
    result = provider === 'stripe'
      ? await handleStripeWebhookEvent({ event: payload, headers: event.headers_json, force: true })
      : await dispatchPaymentWebhook({ provider, event: payload, headers: event.headers_json, force: true });
    if (result?.retryable) replayError = `${result.action || 'Webhook'} 暂未完成，仍需重试`;
    else if (result?.success === false) replayError = result.error || `${result.action || 'Webhook'} 重放未成功`;
  } catch (error) {
    replayError = `Webhook 重放失败（${String(error.code || 'WEBHOOK_ERROR').slice(0, 120)}）`;
  }
  const nextStatus = replayError ? 'replay_failed' : 'replayed';
  await withTransaction(async (tx) => {
    await webhookRepo.markWebhookReplay({ eventId, status: nextStatus, replayedAt: nowIso(), lastError: replayError, transaction: tx, provider });
    await logAudit({ actor, action: 'webhooks.replay', targetType: 'webhook_event', targetId: eventId, riskLevel: 'medium', before: { attempts: event.attempts, status: event.status }, after: { status: nextStatus, provider, replayDetail: result?.action || null, replayError }, requestId, transaction: tx });
  });
  return { eventId, provider, status: nextStatus, detail: result?.action || null, error: replayError };
}

/**
 * 常驻 worker 的心跳：把到期未完成的厂商通知按退避节奏自动重放。
 * 厂商的重推窗口只有几小时，靠人工点「重放」必然漏单。
 */
export async function retryDueWebhookEvents({ limit = 10, now = Date.now(), maxAttempts = WEBHOOK_RETRY.maxAttempts } = {}) {
  const timestamp = new Date(now).toISOString();
  const staleBefore = new Date(now - WEBHOOK_RETRY.staleMs).toISOString();
  const candidates = await webhookRepo.listDueWebhookRetries({ limit, timestamp, staleBefore, maxAttempts });
  const results = [];

  for (const candidate of candidates) {
    const { provider, event_id: eventId } = candidate;
    let claimed = null;
    try {
      claimed = await webhookRepo.claimWebhookRetry({ provider, eventId, timestamp, staleBefore, maxAttempts });
    } catch (error) {
      results.push({ provider, eventId, ok: false, code: String(error.code || 'WEBHOOK_CLAIM_FAILED').slice(0, 120) });
      continue;
    }
    if (!claimed) {
      results.push({ provider, eventId, skipped: true });
      continue;
    }

    try {
      const payload = typeof claimed.payload_json === 'string' ? JSON.parse(claimed.payload_json) : claimed.payload_json;
      if (!payload?.id) {
        // 占位之后连可去重的 ID 都拿不到：必须显式停放并记一次尝试，
        // 否则行会停在 retrying，被 stale 窗口无限回收，永远到不了 maxAttempts。
        await webhookRepo.markWebhookFailedAfterRollback({
          eventId,
          errorCode: 'WEBHOOK_PAYLOAD_INVALID',
          retryAt: webhookRetryAt({ attempts: claimed.attempts + 1 }),
          provider: claimed.provider,
        });
        results.push({ provider: claimed.provider, eventId, ok: false, code: 'WEBHOOK_PAYLOAD_INVALID' });
        continue;
      }
      const result = claimed.provider === 'stripe'
        ? await handleStripeWebhookEvent({ event: payload, headers: claimed.headers_json, force: true })
        : await dispatchPaymentWebhook({ provider: claimed.provider, event: payload, headers: claimed.headers_json, force: true });
      if (result?.success === false && !result.retryable) {
        // 少数前置校验会在写台账之前就被拒（缺订单号），此时行还停在 retrying，必须显式停放。
        // 履约外壳已把这次尝试记账并提交，所以这里只覆写状态、不再累加。
        await webhookRepo.markWebhookFailedAfterRollback({
          eventId,
          errorCode: String(result.error || result.action || 'WEBHOOK_REJECTED').slice(0, 120),
          retryAt: null,
          provider: claimed.provider,
          countAttempt: false,
        });
      }
      results.push({ provider: claimed.provider, eventId, ok: true, action: result?.action || null, retryable: Boolean(result?.retryable) });
    } catch (error) {
      results.push({ provider: claimed.provider, eventId, ok: false, code: String(error.code || 'WEBHOOK_RETRY_FAILED').slice(0, 120) });
    }
  }

  return {
    dueCount: candidates.length,
    claimedCount: results.filter((r) => !r.skipped).length,
    results,
  };
}
