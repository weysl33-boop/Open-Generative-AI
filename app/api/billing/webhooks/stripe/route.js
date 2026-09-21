import { json } from '@/lib/services/auth';
import { paymentNotificationOutcome } from '@/lib/payments/provider';
import { verifyStripeWebhookSignature } from '@/lib/payments/stripeProvider';
import { getStripeWebhookSecret } from '@/lib/payments/providerCredentials';
import { handleStripeWebhookEvent } from '@/lib/services/webhookDispatcher';

export const runtime = 'nodejs';

export async function POST(request) {
  const rawBody = await request.text();
  let secret;
  try { secret = await getStripeWebhookSecret(); } catch (error) {
    console.error('[billing/webhooks/stripe/config]', { code: error.code || 'SECRET_READ_FAILED' });
  }
  if (!secret) return json({ error: 'Stripe webhook 尚未配置' }, { status: 503 });
  if (!verifyStripeWebhookSignature(rawBody, request.headers.get('stripe-signature'), secret)) {
    return json({ error: '无效的 Stripe 签名' }, { status: 400 });
  }
  let event;
  try { event = JSON.parse(rawBody); } catch { return json({ error: '无效的事件数据' }, { status: 400 }); }
  if (!event?.id || typeof event.id !== 'string' || event.id.length > 200) {
    return json({ error: '事件缺少有效 ID' }, { status: 400 });
  }
  try {
    const result = await handleStripeWebhookEvent({ event, headers: { 'stripe-signature': request.headers.get('stripe-signature') } });
    const outcome = paymentNotificationOutcome({ result });
    if (outcome === 'ack') return json({ received: true, action: result.action, duplicate: Boolean(result.duplicate) });
    if (outcome === 'retry') {
      console.error('[billing/webhooks/stripe/retry]', { code: String(result?.action || 'WEBHOOK_RETRYABLE') });
      return json({ error: 'Webhook 依赖的订单尚未同步，将允许上游重试', action: result.action }, { status: 500 });
    }
    console.error('[billing/webhooks/stripe/reject]', { code: String(result?.action || 'WEBHOOK_REJECTED') });
    return json({ error: '事件未通过校验，需在 Webhook 台账中人工处理后重放', action: result.action }, { status: 400 });
  } catch (error) {
    console.error('[billing/webhooks/stripe]', { code: error.code || 'WEBHOOK_ERROR' });
    return json({ error: 'Webhook 处理失败，将允许安全重试' }, { status: 500 });
  }
}
