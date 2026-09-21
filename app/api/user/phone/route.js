import { bindVerifiedPhoneIdentity, getUserFromRequest, json, unbindUserPhone } from '@/lib/services/auth';
import { normalizePhone } from '@/lib/auth/phone';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';
import { getSmsDeviceToken } from '@/lib/smsDevice';
import { verifyPhoneOtp } from '@/lib/smsService';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: '请求参数无效' }, { status: 400 });
    if (Object.hasOwn(body, 'provider')) return json({ error: '短信通道由服务端根据手机号选择' }, { status: 400 });
    const verified = await verifyPhoneOtp({
      phone: body.phone,
      countryCode: body.countryCode || '+86',
      code: body.code,
      challengeId: body.challengeId,
      purpose: 'bind',
      userId: user.id,
      sessionToken: request.cookies.get('ko_session')?.value || null,
      ip: getClientIp(request),
      deviceToken: getSmsDeviceToken(request),
    });
    if (!verified.success) return json({ error: verified.message || '验证码校验失败', code: verified.error || 'OTP_MISSING' }, { status: verified.status || 400 });

    const normalized = normalizePhone(verified.phone, verified.countryCode);
    const result = await bindVerifiedPhoneIdentity({
      userId: user.id,
      phone: normalized.nationalNumber,
      phoneE164: normalized.e164,
      countryCode: verified.countryCode,
      verificationProvider: verified.provider,
      providerUserIdExternal: verified.providerUserIdExternal,
      ip: getClientIp(request),
    });
    if (result.error) return json({ error: result.message || '手机号绑定失败', code: result.error }, { status: result.error === 'PHONE_ALREADY_BOUND' ? 409 : 400 });
    return json({ success: true, phone: normalized.nationalNumber, phoneE164: normalized.e164, countryCode: verified.countryCode, message: '手机号已成功绑定' });
  } catch (error) {
    console.error('[bind phone error]', { code: error?.code || 'PHONE_BIND_FAILED' });
    return json({ error: '绑定手机号失败' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    const result = await unbindUserPhone(user.id);
    if (result.error) {
      return json({ error: result.message }, { status: 400 });
    }
    return json({ success: true, message: result.message });
  } catch (error) {
    console.error('[unbind phone error]', error);
    return json({ error: '解绑手机号失败，请稍后重试' }, { status: 500 });
  }
}
