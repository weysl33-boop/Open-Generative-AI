import { getUserBySession, json, refreshSession, setSessionCookie } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 4 * 1024 });
    if (guarded) return guarded;
    const currentToken = request.cookies.get('ko_session')?.value;
    const rotated = await refreshSession(currentToken);
    if (!rotated) return json({ error: '会话已失效，请重新登录' }, { status: 401 });

    const user = await getUserBySession(rotated.token);
    if (!user) return json({ error: '会话刷新失败，请重新登录' }, { status: 401 });
    const response = json({ user, expires: rotated.expires });
    setSessionCookie(response, rotated.token, rotated.expires);
    return response;
  } catch (error) {
    console.error('[auth/refresh]', error);
    return json({ error: '会话刷新暂时不可用' }, { status: 500 });
  }
}
