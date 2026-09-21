import { getUserFromRequest, json } from '@/lib/services/auth';
import { getDailyLoginStatus, claimDailyLoginCoin } from '@/lib/financial/currencyService';

export const runtime = 'nodejs';

// GET: 获取今日登录领币状态与当前余额
export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ claimed: false, canClaim: false, balance: 0 });
  }
  const status = await getDailyLoginStatus(user.id);
  return json(status);
}

// POST: 领取今日登录奖励 1 K币 (参考 B 站硬币机制)
export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ error: '请先登录后再领取登录奖励' }, { status: 401 });
  }
  try {
    const result = await claimDailyLoginCoin(user.id);
    return json(result);
  } catch (err) {
    return json({ error: err.message || '领取失败' }, { status: 500 });
  }
}
