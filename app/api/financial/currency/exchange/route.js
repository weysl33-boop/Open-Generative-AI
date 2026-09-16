import { getUserFromRequest, json } from '../../../../../lib/billing.js';
import { exchangeCoinToCredits, buyVipWithCoin } from '../../../../../lib/financial/index.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const body = await request.json();
    const { type = 'credits', coinAmount, planId } = body;
    const idempotencyKey = request.headers.get('x-idempotency-key') || null;

    if (type === 'credits') {
      if (!coinAmount || Number(coinAmount) <= 0) {
        return json({ error: '请输入有效的兑换 K 币数量' }, { status: 400 });
      }
      const result = await exchangeCoinToCredits({
        userId: user.id,
        coinAmount: Number(coinAmount),
        idempotencyKey,
      });
      return json(result);
    } else if (type === 'vip') {
      if (!planId) {
        return json({ error: '请选择要购买的会员方案' }, { status: 400 });
      }
      const result = await buyVipWithCoin({
        userId: user.id,
        planId,
        idempotencyKey,
      });
      return json(result);
    } else {
      return json({ error: '不支持的兑换类型' }, { status: 400 });
    }
  } catch (error) {
    console.error('[api/financial/currency/exchange]', error);
    return json({ error: error.message || '兑换操作失败' }, { status: 400 });
  }
}
