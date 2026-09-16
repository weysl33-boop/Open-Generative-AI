import { getUserFromRequest, json } from '../../../../../lib/billing.js';
import { voidCredits } from '../../../../../lib/financial/index.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const body = await request.json();
    const { reservationId, reason } = body;

    if (!reservationId) {
      return json({ error: '缺少预扣单号 reservationId' }, { status: 400 });
    }

    const result = await voidCredits({
      reservationId,
      reason: reason || '用户取消或生成失败',
    });

    return json(result);
  } catch (error) {
    console.error('[api/financial/credits/void]', error);
    return json({ error: error.message || '释放回滚失败' }, { status: 400 });
  }
}
