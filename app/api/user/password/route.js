import { changeUserPassword, getUserFromRequest, json } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const result = await changeUserPassword({
      userId: user.id,
      oldPassword: String(body.oldPassword || ''),
      newPassword: String(body.newPassword || ''),
    });
    if (result.error) return json({ error: result.error }, { status: 400 });

    return json({ success: true, message: '密码已成功更新' });
  } catch (error) {
    console.error('[password change error]', error);
    return json({ error: '修改密码处理失败，请稍后重试' }, { status: 500 });
  }
}
