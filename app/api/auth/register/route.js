import { createSession, createUser, json, setSessionCookie, validateCredentials } from '@/lib/billing';
import { getSettingByKey } from '@/lib/repositories/settings';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const maintSetting = getSettingByKey('maintenance_mode');
    if (maintSetting?.value?.enabled) {
      return json({ error: maintSetting.value.message || '系统维护中，暂停用户注册' }, { status: 503 });
    }

    const regSetting = getSettingByKey('registration_enabled');
    if (regSetting?.value && regSetting.value.enabled === false) {
      return json({ error: '新用户注册通道当前已暂停开放' }, { status: 403 });
    }

    const body = await request.json();
    const validationError = validateCredentials(body.email, body.password);
    if (validationError) return json({ error: validationError }, { status: 400 });

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
    const result = await createUser(body.email, body.password, { registrationSource: 'web_email', ip });
    if (result.error) return json({ error: result.error }, { status: 409 });

    const session = await createSession(result.user.id);
    const response = json({ user: result.user });
    setSessionCookie(response, session.token, session.expires);
    return response;
  } catch (error) {
    console.error('[auth/register]', error);
    return json({ error: '注册暂时不可用，请稍后重试' }, { status: 500 });
  }
}
