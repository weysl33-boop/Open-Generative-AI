import { authenticateUser, createSession, json, setSessionCookie } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
    const user = await authenticateUser(body.email, body.password, ip);
    if (!user) return json({ error: '邮箱或密码不正确' }, { status: 401 });
    if (user.error === 'ACCOUNT_SUSPENDED') {
      return json({ error: user.message }, { status: 403 });
    }
    const session = await createSession(user.id);
    const response = json({ user });
    setSessionCookie(response, session.token, session.expires);
    return response;
  } catch (error) {
    console.error('[auth/login]', error);
    return json({ error: '登录暂时不可用' }, { status: 500 });
  }
}
