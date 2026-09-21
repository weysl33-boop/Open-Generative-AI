import crypto from 'node:crypto';
import Stripe from 'stripe';
import { assertPaymentProvider, normalizeProviderError } from './provider.js';

const STRIPE_API_VERSION = '2026-07-29.dahlia';
const MAX_SIGNATURE_AGE_SECONDS = 300;

export function verifyStripeWebhookSignature(rawBody, signatureHeader, secret, nowMs = Date.now()) {
  if (typeof rawBody !== 'string' || !signatureHeader || !secret) return false;
  const parts = String(signatureHeader).split(',').reduce((result, part) => {
    const separator = part.indexOf('=');
    if (separator <= 0) return result;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!result[key]) result[key] = [];
    result[key].push(value);
    return result;
  }, {});
  const timestamp = Number(parts.t?.[0]);
  if (!Number.isFinite(timestamp) || !parts.v1?.length) return false;
  const age = Math.abs(Math.floor(Number(nowMs) / 1000) - timestamp);
  if (!Number.isFinite(age) || age > MAX_SIGNATURE_AGE_SECONDS) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return parts.v1.some((candidate) => {
    const left = Buffer.from(expected, 'utf8');
    const right = Buffer.from(candidate, 'utf8');
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  });
}

function requireStripeConfig({ secret = process.env.STRIPE_SECRET_KEY, mode = process.env.STRIPE_MODE } = {}) {
  if (!secret) throw Object.assign(new Error('Stripe 尚未配置商户密钥'), { code: 'PROVIDER_NOT_CONFIGURED', status: 503 });
  const inferredMode = mode || (secret.startsWith('sk_test_') ? 'test' : 'live');
  if (!['test', 'live'].includes(inferredMode)) throw Object.assign(new Error('Stripe 模式配置无效'), { code: 'PROVIDER_MODE_INVALID', status: 503 });
  if (inferredMode === 'test' && !secret.startsWith('sk_test_')) throw Object.assign(new Error('Stripe 测试模式必须使用测试密钥'), { code: 'PROVIDER_MODE_MISMATCH', status: 503 });
  if (inferredMode === 'live' && secret.startsWith('sk_test_')) throw Object.assign(new Error('Stripe 正式模式不能使用测试密钥'), { code: 'PROVIDER_MODE_MISMATCH', status: 503 });
  if (inferredMode === 'live' && process.env.STRIPE_LIVE_ENABLED !== 'true') throw Object.assign(new Error('Stripe 正式模式尚未完成最终启用'), { code: 'PROVIDER_LIVE_DISABLED', status: 503 });
  return { secret, mode: inferredMode };
}

export function createStripeProvider({
  client = null,
  secret = process.env.STRIPE_SECRET_KEY,
  mode = process.env.STRIPE_MODE,
  randomSuffix = () => crypto.randomBytes(4).toString('hex'),
  onCall = null,
} = {}) {
  const config = client ? { secret: secret || 'injected', mode: mode || 'test' } : requireStripeConfig({ secret, mode });
  const stripe = client || new Stripe(config.secret, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 0 });

  async function call(action, callback) {
    const startedAt = Date.now();
    try {
      const result = await callback();
      try { await onCall?.({ provider: 'stripe', action, status: 'succeeded', latencyMs: Date.now() - startedAt }); } catch {}
      return result;
    } catch (error) {
      const normalized = normalizeProviderError(error, { provider: 'stripe', action });
      try { await onCall?.({ provider: 'stripe', action, status: 'failed', latencyMs: Date.now() - startedAt, errorCode: normalized.code }); } catch {}
      throw normalized;
    }
  }

  const provider = {
    mode: config.mode,
    async createCheckout({ order, user, plan, successUrl, cancelUrl }) {
      const amountMinor = Number(order?.amount_minor);
      const currency = String(order?.currency || '').toLowerCase();
      if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0 || !/^[a-z]{3}$/.test(currency)) {
        throw new PaymentProviderError('订单金额无效，无法创建 Stripe 收银台', {
          provider: 'stripe',
          action: 'createCheckout',
          code: 'ORDER_AMOUNT_INVALID',
          status: 400,
        });
      }
      const params = {
        mode: 'subscription',
        integration_identifier: `koyosim_checkout_${randomSuffix()}`,
        success_url: successUrl,
        cancel_url: cancelUrl,
        customer_email: user.email,
        metadata: {
          user_id: user.id,
          plan_id: plan.id,
          order_id: order.id,
        },
        subscription_data: {
          metadata: {
            user_id: user.id,
            plan_id: plan.id,
            order_id: order.id,
          },
        },
        line_items: [{
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountMinor,
            recurring: { interval: 'month' },
            product_data: { name: plan.name },
          },
        }],
      };
      return call('createCheckout', () => stripe.checkout.sessions.create(params, { idempotencyKey: `checkout:${order.id}` }));
    },
    async retrievePayment(providerOrderId) {
      return call('retrievePayment', () => stripe.checkout.sessions.retrieve(providerOrderId));
    },
    async cancel(subscriptionId) {
      return call('cancel', () => stripe.subscriptions.cancel(subscriptionId));
    },
    async refund({ paymentIntentId, idempotencyKey, reason = null }) {
      const params = { payment_intent: paymentIntentId, ...(reason ? { reason } : {}) };
      return call('refund', () => stripe.refunds.create(params, { idempotencyKey: idempotencyKey || `refund:${paymentIntentId}` }));
    },
    verifyWebhookSignature(rawBody, signatureHeader, webhookSecret = process.env.STRIPE_WEBHOOK_SECRET) {
      return verifyStripeWebhookSignature(rawBody, signatureHeader, webhookSecret);
    },
  };
  return assertPaymentProvider(provider);
}

export function getStripeProvider(options = {}) {
  return createStripeProvider(options);
}
