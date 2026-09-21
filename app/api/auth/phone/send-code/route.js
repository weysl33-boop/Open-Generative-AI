import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';
import { createSmsDeviceToken, getSmsDeviceToken, setSmsDeviceCookie } from '@/lib/smsDevice';
import { requestPhoneOtp } from '@/lib/smsService';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
    if (guarded) return guarded;
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    if (Object.hasOwn(body, 'provider')) {
      return NextResponse.json({ error: '短信通道由服务端根据手机号选择' }, { status: 400 });
    }
    if (body.purpose && !['login', 'bind'].includes(body.purpose)) {
      return NextResponse.json({ error: '请求参数无效' }, { status: 400 });
    }
    const purpose = body.purpose === 'bind' ? 'bind' : 'login';
    const user = purpose === 'bind' ? await getUserFromRequest(request) : null;
    if (purpose === 'bind' && !user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

    const priorDeviceToken = getSmsDeviceToken(request);
    const deviceToken = priorDeviceToken || createSmsDeviceToken();
    const result = await requestPhoneOtp({
      phone: body.phone,
      countryCode: body.countryCode || '+86',
      purpose,
      userId: user?.id || null,
      sessionToken: request.cookies.get('ko_session')?.value || null,
      ip: getClientIp(request),
      deviceToken,
      challengeId: body.challengeId || null,
      recaptchaToken: body.recaptchaToken || null,
      captchaTicket: body.captchaTicket || null,
      captchaRandstr: body.captchaRandstr || null,
    });

    const status = result.requiresCaptcha ? 428 : (result.status || 200);
    const response = NextResponse.json(
      result.success
        ? { success: true, challengeId: result.challengeId, cooldown: result.cooldown, expiresInSeconds: result.expiresInSeconds }
        : result.requiresCaptcha
          ? {
            success: false,
            requiresCaptcha: true,
            captchaType: result.captchaType,
            challengeId: result.challengeId,
            ...(result.firebaseConfig ? { firebaseConfig: result.firebaseConfig } : {}),
            ...(result.captchaAppId ? { captchaAppId: result.captchaAppId } : {}),
          }
          : { error: result.message || '验证码发送失败，请稍后重试', code: result.error || 'SMS_INTERNAL_ERROR' },
      {
        status,
        headers: result.status === 429 && result.retryAfterSeconds
          ? { 'Retry-After': String(result.retryAfterSeconds) }
          : undefined,
      },
    );
    if (!priorDeviceToken) setSmsDeviceCookie(response, deviceToken);
    return response;
  } catch (error) {
    console.error('[auth/phone/send-code]', { code: error?.code || 'SMS_INTERNAL_ERROR' });
    return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 500 });
  }
}
