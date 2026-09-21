import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { voidCredits } from '../../../../../lib/financial/index.js';
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
    const { reservationId, reason } = body;

    if (!reservationId) {
      return json({ error: '缺少预扣单号 reservationId' }, { status: 400 });
    }

    const result = await voidCredits({
      reservationId,
      reason: reason || '用户取消或生成失败',
      expectedUserId: user.id,
    });

    return json(result);
  } catch (error) {
    console.error('[api/financial/credits/void]', error);
    return json({ error: publicErrorMessage(error, '释放回滚失败') }, { status: 400 });
  }
}
