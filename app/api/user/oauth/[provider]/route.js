import { getUserFromRequest, json, unbindUserOAuth } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const resolvedParams = await params;
  const provider = String(resolvedParams.provider || '').toLowerCase().trim();
  const isBound = Array.isArray(user.loginProviders) && user.loginProviders.includes(provider);

  return json({
    provider,
    isBound,
  });
}

export async function DELETE(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    const resolvedParams = await params;
    const provider = String(resolvedParams.provider || '').toLowerCase().trim();
    if (!provider) return json({ error: '参数无效' }, { status: 400 });

    const result = await unbindUserOAuth(user.id, provider);
    if (result.error) {
      return json({ error: result.message }, { status: 400 });
    }
    return json({ success: true, message: result.message });
  } catch (error) {
    console.error('[unbind oauth error]', error);
    return json({ error: '解绑第三方账号失败，请稍后重试' }, { status: 500 });
  }
}
