import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { getCreditWallet } from '../../../../../lib/financial/index.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const wallet = await getCreditWallet(user.id);
    return json({
      wallet,
    });
  } catch (error) {
    console.error('[api/financial/credits/wallet]', error);
    return json({ error: publicErrorMessage(error, '获取积分状态失败') }, { status: 500 });
  }
}
