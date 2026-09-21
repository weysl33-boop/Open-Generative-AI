import { getUserFromRequest, json } from '@/lib/services/auth';
import { createPaymentCheckout } from '@/lib/services/paymentService';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要先登录' }, { status: 401 });
  try {
    const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
    if (guarded) return guarded;
    const limit = await consumeRateLimit({ scope: 'billing_checkout_user', subject: user.id || getClientIp(request), limit: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const body = await request.json();
    const idempotencyKey = request.headers.get('idempotency-key') || body.idempotencyKey;
    const provider = String(body.provider || '').toLowerCase();
    if (!['stripe', 'wechat', 'alipay'].includes(provider)) return json({ error: '不支持的支付渠道' }, { status: 400 });
    const result = await createPaymentCheckout({
      request,
      user,
      productType: body.productType || 'subscription',
      productId: body.productId,
      planId: body.planId,
      provider,
      billingCycle: body.billingCycle,
      idempotencyKey,
    });
    if (result.error) return json({ error: result.error }, { status: result.status });
    return json(result);
  } catch (error) {
    console.error('[billing/checkout]', error);
    const status = error.code === 'IDEMPOTENCY_REQUIRED' || error.code === 'IDEMPOTENCY_CONFLICT' ? 422 : 500;
    return json({ error: publicErrorMessage(error, '创建订单失败') }, { status });
  }
}
