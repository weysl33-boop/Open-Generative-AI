import crypto from 'node:crypto';
import {
  findUserById, getPlan, json, recordWebhookEvent, upsertSubscription, updateOrder,
} from '@/lib/billing';

export const runtime = 'nodejs';

function verifyStripeSignature(rawBody, signatureHeader, secret) {
  if (!signatureHeader || !secret) return false;
  const parts = Object.fromEntries(signatureHeader.split(',').map((part) => {
    const [key, value] = part.split('=', 2);
    return [key, value];
  }));
  if (!parts.t || !parts.v1) return false;
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(parts.t));
  if (!Number.isFinite(age) || age > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${parts.t}.${rawBody}`).digest('hex');
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(parts.v1, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

export async function POST(request) {
  const rawBody = await request.text();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return json({ error: 'Stripe webhook 尚未配置' }, { status: 503 });
  if (!verifyStripeSignature(rawBody, request.headers.get('stripe-signature'), secret)) {
    return json({ error: '无效的 Stripe 签名' }, { status: 400 });
  }
  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: '无效的事件数据' }, { status: 400 }); }
  if (!recordWebhookEvent('stripe', event.id, event)) return json({ received: true, duplicate: true });

  const object = event.data?.object || {};
  if (event.type === 'checkout.session.completed') {
    const userId = object.metadata?.user_id;
    const plan = getPlan(object.metadata?.plan_id);
    if (userId && findUserById(userId) && plan) {
      upsertSubscription({
        userId, provider: 'stripe', providerCustomerId: object.customer || null,
        providerSubscriptionId: object.subscription || object.id, planId: plan.id,
        status: 'active', currentPeriodEnd: null,
      });
      if (object.metadata?.order_id) updateOrder(object.metadata.order_id, { status: 'paid', provider_order_id: object.id });
    }
  } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const metadata = object.metadata || {};
    const plan = getPlan(metadata.plan_id || 'pro');
    const userId = metadata.user_id;
    if (userId && findUserById(userId) && plan) {
      const end = object.current_period_end ? new Date(object.current_period_end * 1000).toISOString() : null;
      upsertSubscription({
        userId, provider: 'stripe', providerCustomerId: object.customer || null,
        providerSubscriptionId: object.id, planId: plan.id,
        status: event.type.endsWith('.deleted') ? 'canceled' : (object.status || 'active'),
        currentPeriodEnd: end,
      });
    }
  }
  return json({ received: true });
}
