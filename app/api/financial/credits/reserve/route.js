import { getUserFromRequest, json } from '../../../../../lib/billing.js';
import { reserveCredits } from '../../../../../lib/financial/index.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const body = await request.json();
    const { amount, modelId, studioId = 'studio' } = body;

    if (!amount || Number(amount) <= 0) {
      return json({ error: '预扣积分额度必须大于 0' }, { status: 400 });
    }
    if (!modelId) {
      return json({ error: '缺少目标模型标识' }, { status: 400 });
    }

    const idempotencyKey = request.headers.get('x-idempotency-key') || null;

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
    return json({ error: error.message || '算力积分预冻结失败' }, { status: 400 });
  }
}
