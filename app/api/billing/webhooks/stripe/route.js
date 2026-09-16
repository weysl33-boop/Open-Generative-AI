import crypto from 'node:crypto';
import { json, recordWebhookEvent } from '@/lib/billing';
import { dispatchStripeEvent } from '@/lib/services/webhookDispatcher';

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
  if (!await recordWebhookEvent('stripe', event.id, event)) return json({ received: true, duplicate: true });

  await dispatchStripeEvent(event);
  return json({ received: true });
}
