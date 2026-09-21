import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { transferCurrency } from '../../../../../lib/financial/index.js';
import { guardMutation } from '../../../../../lib/security/requestGuard.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const { receiverId, amount, payPassword } = body;

    if (!receiverId) return json({ error: '请指定转账接收人' }, { status: 400 });
    if (!amount || Number(amount) <= 0) return json({ error: '请输入有效的转账金额' }, { status: 400 });
    if (!payPassword) return json({ error: '请输入支付密码' }, { status: 400 });

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || 'web';
    const idempotencyKey = request.headers.get('x-idempotency-key') || null;
    if (!idempotencyKey || idempotencyKey.trim().length < 8) {
      return json({ error: '缺少有效的 x-idempotency-key，重复请求可能造成重复转账' }, { status: 422 });
    }

    const result = await transferCurrency({
      senderId: user.id,
      receiverId,
      amount,
      payPassword,
      clientIp,
      userAgent,
      idempotencyKey,
    });

    return json(result);
  } catch (error) {
    console.error('[api/financial/currency/transfer]', error);
    return json({ error: publicErrorMessage(error, '转账操作失败') }, { status: 400 });
  }
}
