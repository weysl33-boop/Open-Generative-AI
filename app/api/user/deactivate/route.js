import { deactivateUserAccount, getUserFromRequest, json } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    await deactivateUserAccount(user.id);

    const response = json({ success: true, message: '账户已申请注销，已安全退出' });
    response.cookies.delete('ko_session');
    return response;
  } catch (error) {
    console.error('[deactivate error]', error);
    return json({ error: '账户注销失败，请联系客服' }, { status: 500 });
  }
}
