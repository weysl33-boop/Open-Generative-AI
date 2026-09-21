import { createSession, createUser, json, requiresOnboarding, setSessionCookie, validateCredentials } from '@/lib/services/auth';
import { getSettingByKey } from '@/lib/services/settings';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
    if (guarded) return guarded;
    const ip = getClientIp(request);
    const limit = await consumeRateLimit({ scope: 'auth_register_ip', subject: ip, limit: 10, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const maintSetting = await getSettingByKey('maintenance_mode');
    if (maintSetting?.value?.enabled) {
      return json({ error: maintSetting.value.message || '系统维护中，暂停用户注册' }, { status: 503 });
    }

    const regSetting = await getSettingByKey('registration_enabled');
    if (regSetting?.value && regSetting.value.enabled === false) {
      return json({ error: '新用户注册通道当前已暂停开放' }, { status: 403 });
    }

    const body = await request.json();
    const validationError = validateCredentials(body.email, body.password);
    if (validationError) return json({ error: validationError }, { status: 400 });

    const result = await createUser(body.email, body.password, { registrationSource: 'web_email', ip });
    if (result.error) return json({ error: result.error }, { status: 409 });

    const session = await createSession(result.user.id);
    const response = json({ user: result.user, requiresOnboarding: await requiresOnboarding(result.user.id) });
    setSessionCookie(response, session.token, session.expires);
    return response;
  } catch (error) {
    console.error('[auth/register]', error);
    return json({ error: '注册暂时不可用，请稍后重试' }, { status: 500 });
  }
}
