import {
  createSession,
  findOrCreateUserByPhone,
  json,
  recordVerifiedPhoneLogin,
  requiresOnboarding,
  setSessionCookie,
} from '@/lib/services/auth';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';
import { getSmsDeviceToken } from '@/lib/smsDevice';
import { verifyPhoneOtp } from '@/lib/smsService';
import { normalizePhone } from '@/lib/auth/phone';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
    if (guarded) return guarded;
    const ip = getClientIp(request);
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: '请求参数无效' }, { status: 400 });
    if (Object.hasOwn(body, 'provider')) return json({ error: '短信通道由服务端根据手机号选择' }, { status: 400 });
    const verified = await verifyPhoneOtp({
      phone: body.phone,
      countryCode: body.countryCode || '+86',
      code: body.code,
      challengeId: body.challengeId,
      purpose: 'login',
      sessionToken: request.cookies.get('ko_session')?.value || null,
      ip,
      deviceToken: getSmsDeviceToken(request),
    });
    if (!verified.success) {
      return json({ error: verified.message || '验证码校验失败', code: verified.error || 'OTP_MISSING' }, { status: verified.status || 400 });
    }

    const normalizedPhone = normalizePhone(verified.phone, verified.countryCode);
    const result = await findOrCreateUserByPhone({
      phone: normalizedPhone.nationalNumber,
      countryCode: verified.countryCode,
      verificationProvider: verified.provider,
      providerUserIdExternal: verified.providerUserIdExternal,
      registrationSource: 'phone_sms_web',
      ip
    });

    if (result.error) {
      return json({ error: result.message || '登录失败', code: result.error }, { status: result.error === 'ACCOUNT_SUSPENDED' ? 403 : 409 });
    }

    const { user, isNew } = result;
    await recordVerifiedPhoneLogin({
      userId: user.id,
      phoneE164: verified.phone,
      verificationProvider: verified.provider,
      providerUserIdExternal: verified.providerUserIdExternal,
      ip,
    });

    // 3. 签发会话
    const session = await createSession(user.id);
    const response = json({
      user: {
        id: user.id,
        uuid: user.uuid,
        displayName: user.display_name,
        phone: user.phone,
        phoneCountryCode: user.phone_country_code,
        email: user.email,
        role: user.role,
        status: user.status,
        locale: user.locale || 'zh-CN',
        credits: Number(user.credits || 0),
        loginProviders: ['phone']
      },
      isNew,
      requiresOnboarding: await requiresOnboarding(user.id),
    });

    setSessionCookie(response, session.token, session.expires);
    const userLocale = user.locale || 'zh-CN';
    response.cookies.set('NEXT_LOCALE', userLocale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    response.cookies.set('locale', userLocale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    return response;
  } catch (error) {
    console.error('[auth/phone/verify]', { code: error?.code || 'PHONE_AUTH_FAILED' });
    return json({ error: '登录验证失败，请稍后重试' }, { status: 500 });
  }
}
