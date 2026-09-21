import { getUserFromRequest, json } from '@/lib/services/auth';
import { createGenerationQuote } from '@/lib/services/generationQuote';
import { getSubscription } from '@/lib/services/billing';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const guarded = guardMutation(request, { maxBytes: 128 * 1024 });
    if (guarded) return guarded;

    const body = await request.json().catch(() => ({}));
    const modelId = body.modelId || body.model || body.endpoint;
    if (!modelId) {
      return json({ error: '必须指定模型 ID' }, { status: 422 });
    }

    // 订阅等级直接决定报价折扣。读不到生效订阅才按 free 计价；
    // 这里不能吞掉数据库异常，否则付费用户会被静默按免费档报价。
    const activeSubscription = await getSubscription(user.id);
    const subscriptionLevel = activeSubscription?.plan_id || 'free';

    const quote = await createGenerationQuote({
      userId: user.id,
      modelId,
      parameters: body.parameters || body,
      subscriptionLevel,
    });

    return json({
      quote_id: quote.quoteId,
      credits: quote.credits,
      pricing_source: quote.source,
      pricing_breakdown: quote.pricingBreakdown,
      expires_at: quote.expiresAt,
    }, { status: 201 });
  } catch (error) {
    console.error('[api/generation/quote]', error);
    const status = error.code === 'UNAUTHENTICATED' ? 401
      : error.code === 'MODEL_NOT_FOUND' ? 404
      : 422;
    return json({
      error: publicErrorMessage(error, '获取模型报价失败'),
      code: error.code || 'QUOTE_FAILED',
    }, { status });
  }
}
