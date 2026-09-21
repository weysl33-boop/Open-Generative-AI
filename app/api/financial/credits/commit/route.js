import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { commitCredits } from '../../../../../lib/financial/index.js';
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
    const { reservationId, creationId = null, settledAmount = null } = body;

    if (!reservationId) {
      return json({ error: '缺少预扣单号 reservationId' }, { status: 400 });
    }

    const result = await commitCredits({
      reservationId,
      creationId,
      settledAmount: settledAmount !== null ? Number(settledAmount) : null,
      expectedUserId: user.id,
    });

    return json(result);
  } catch (error) {
    console.error('[api/financial/credits/commit]', error);
    return json({ error: publicErrorMessage(error, '确认扣费结算失败') }, { status: 400 });
  }
}
