import { getUserFromRequest, json } from '../../../../../lib/billing.js';
import { setPayPassword } from '../../../../../lib/financial/index.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const body = await request.json();
    const { password } = body;

    if (!password || String(password).length < 6) {
      return json({ error: '支付密码长度不能低于 6 位' }, { status: 400 });
    }

    await setPayPassword(user.id, password);
    return json({ success: true, message: '支付密码设置成功' });
  } catch (error) {
    console.error('[api/financial/currency/password]', error);
    return json({ error: error.message || '设置支付密码失败' }, { status: 400 });
  }
}
