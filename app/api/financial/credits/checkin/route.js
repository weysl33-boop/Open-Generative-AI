import { getUserFromRequest, json } from '../../../../../lib/billing.js';
import { dailyCheckIn } from '../../../../../lib/financial/index.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const result = await dailyCheckIn(user.id);
    return json(result);
  } catch (error) {
    console.error('[api/financial/credits/checkin]', error);
    return json({ error: error.message || '签到失败' }, { status: 400 });
  }
}
