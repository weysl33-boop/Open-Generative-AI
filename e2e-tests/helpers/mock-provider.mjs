/**
 * E2E Test Suite - Mock Provider & Simulation Utilities
 * 遵循 Opaque-box 黑盒测试原则，提供真实的签名生成、事件构造与测试数据生成器
 */
import crypto from 'node:crypto';

/**
 * 生成符合 Stripe 规范的 HMAC-SHA256 签名头
 * 格式：t=timestamp,v1=signature
 */
export function generateStripeSignature(rawBody, secret, timestamp = Math.floor(Date.now() / 1000)) {
  if (typeof rawBody !== 'string') {
    rawBody = JSON.stringify(rawBody);
  }
  const digest = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

/**
 * 构造合法的 Stripe checkout.session.completed Webhook 事件
 */
export function createStripeCheckoutEvent({
  eventId = `evt_${crypto.randomBytes(8).toString('hex')}`,
  orderId = `ord_${crypto.randomBytes(8).toString('hex')}`,
  userId,
  planId = 'pro',
  creditAmount = '500',
  customerId = `cus_${crypto.randomBytes(6).toString('hex')}`,
  paymentIntentId = `pi_${crypto.randomBytes(8).toString('hex')}`,
  subscriptionId = `sub_${crypto.randomBytes(8).toString('hex')}`,
  amountTotal = 1900,
  currency = 'usd',
} = {}) {
  return {
    id: eventId,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    type: 'checkout.session.completed',
    data: {
      object: {
        id: `cs_${crypto.randomBytes(8).toString('hex')}`,
        object: 'checkout.session',
        amount_total: amountTotal,
        currency,
        customer: customerId,
        payment_intent: paymentIntentId,
        payment_status: 'paid',
        subscription: subscriptionId,
        metadata: {
          user_id: userId,
          order_id: orderId,
          plan_id: planId,
          credit_amount: String(creditAmount),
        },
      },
    },
  };
}

/**
 * 构造合法的 Stripe charge.refunded Webhook 事件
 */
export function createStripeRefundEvent({
  eventId = `evt_ref_${crypto.randomBytes(8).toString('hex')}`,
  paymentIntentId,
  amountRefunded = 1900,
  currency = 'usd',
} = {}) {
  return {
    id: eventId,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    type: 'charge.refunded',
    data: {
      object: {
        id: `ch_${crypto.randomBytes(8).toString('hex')}`,
        object: 'charge',
        amount_refunded: amountRefunded,
        currency,
        payment_intent: paymentIntentId,
        status: 'succeeded',
      },
    },
  };
}

/**
 * 构造合法的 Stripe payment_intent.payment_failed Webhook 事件
 */
export function createStripePaymentFailedEvent({
  eventId = `evt_fail_${crypto.randomBytes(8).toString('hex')}`,
  orderId,
  paymentIntentId = `pi_fail_${crypto.randomBytes(8).toString('hex')}`,
} = {}) {
  return {
    id: eventId,
    object: 'event',
    api_version: '2026-07-29.dahlia',
    created: Math.floor(Date.now() / 1000),
    type: 'payment_intent.payment_failed',
    data: {
      object: {
        id: paymentIntentId,
        object: 'payment_intent',
        status: 'requires_payment_method',
        last_payment_error: {
          code: 'card_declined',
          message: 'Your card was declined.',
        },
        metadata: {
          order_id: orderId,
        },
      },
    },
  };
}

/**
 * 构造合法的生成请求 Payload
 */
export function createGenerationPayload({
  model = 'nano-fast',
  prompt = 'a stunning digital oil painting of futuristic cyberpunk city',
  parameters = {},
  idempotencyKey = `e2e_gen_${crypto.randomBytes(6).toString('hex')}`,
  studioId = 'studio_image',
  label = null,
} = {}) {
  return {
    model,
    prompt,
    parameters: {
      aspect_ratio: '16:9',
      steps: 30,
      cfg_scale: 7.5,
      ...parameters,
    },
    idempotencyKey,
    studioId,
    label: label || `E2E Test ${model}`,
  };
}

/**
 * 生成随机测试邮箱
 */
export function generateRandomEmail(prefix = 'e2e_user') {
  const rand = crypto.randomBytes(5).toString('hex');
  const ts = Date.now().toString(36);
  return `${prefix}_${ts}_${rand}@koyosim.test`;
}

/**
 * 生成随机幂等键
 */
export function generateIdempotencyKey(prefix = 'e2e_idem') {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}
