import { authenticateUser, createSession, json, requiresOnboarding, setSessionCookie } from '@/lib/services/auth';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
    if (guarded) return guarded;
    const ip = getClientIp(request);
    const limit = await consumeRateLimit({ scope: 'auth_login_ip', subject: ip, limit: 20, windowMs: 15 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const body = await request.json();
    const identifier = body.identifier || body.id || body.email || body.account;
    const user = await authenticateUser(identifier, body.password, ip);
    if (!user) return json({ error: '账号/邮箱或密码不正确' }, { status: 401 });
    if (user.error === 'ACCOUNT_SUSPENDED') {
      return json({ error: user.message }, { status: 403 });
    }
    const session = await createSession(user.id);
    const response = json({ user, requiresOnboarding: await requiresOnboarding(user.id) });
    setSessionCookie(response, session.token, session.expires);
    if (user.locale) {
      response.cookies.set('NEXT_LOCALE', user.locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
      response.cookies.set('locale', user.locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    }
    return response;
  } catch (error) {
    console.error('[auth/login]', error);
    return json({ error: '登录暂时不可用' }, { status: 500 });
  }
}
