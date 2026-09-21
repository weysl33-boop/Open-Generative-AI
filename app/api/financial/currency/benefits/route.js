import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { redeemBenefit } from '../../../../../lib/financial/index.js';
import { guardMutation, consumeRateLimit, rateLimitResponse } from '../../../../../lib/security/requestGuard.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再兑换' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const limited = await consumeRateLimit({
      scope: 'benefit_redeem',
      subject: user.id,
      limit: 20,
      windowMs: 3600 * 1000,
    });
    if (!limited.allowed) return rateLimitResponse(limited);

    const idempotencyKey = request.headers.get('x-idempotency-key');
    const body = await request.json();
    const { benefit, result } = await redeemBenefit({
      userId: user.id,
      benefitId: body.benefitId,
      idempotencyKey,
    });

    return json({ ...result, benefitId: benefit.id, title: benefit.title });
  } catch (error) {
    console.error('[api/financial/currency/benefits POST]', error);
    return json({ error: publicErrorMessage(error, '兑换失败，请稍后重试') }, { status: 400 });
  }
}
