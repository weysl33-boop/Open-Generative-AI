import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { reserveCredits } from '../../../../../lib/financial/index.js';
import { guardMutation } from '../../../../../lib/security/requestGuard.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const { amount, modelId, studioId = 'studio' } = body;

    if (!amount || Number(amount) <= 0) {
      return json({ error: '预扣积分额度必须大于 0' }, { status: 400 });
    }
    if (!modelId) {
      return json({ error: '缺少目标模型标识' }, { status: 400 });
    }

    const idempotencyKey = request.headers.get('x-idempotency-key') || request.headers.get('idempotency-key') || null;
    if (!idempotencyKey || idempotencyKey.length < 8 || idempotencyKey.length > 200) {
      return json({ error: '缺少 x-idempotency-key，重复请求可能导致业务不一致' }, { status: 422 });
    }

    const result = await reserveCredits({
      userId: user.id,
      amount: Number(amount),
      modelId,
      studioId,
      idempotencyKey,
    });

    return json(result);
  } catch (error) {
    console.error('[api/financial/credits/reserve]', error);
    return json({ error: publicErrorMessage(error, '算力积分预冻结失败') }, { status: 400 });
  }
}
