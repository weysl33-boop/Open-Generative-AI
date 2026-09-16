import { getUserFromRequest, json } from '../../../../../lib/billing.js';
import { getCreditWallet } from '../../../../../lib/financial/index.js';

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
    return json({ error: error.message || '获取积分状态失败' }, { status: 500 });
  }
}
