import { getUserFromRequest, json, unbindUserEmail } from '@/lib/services/auth';
import { confirmEmailBinding, requestEmailBinding } from '@/lib/services/emailVerification';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { hashRateLimitSubject } from '@/lib/smsCrypto';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const email = String(body.email || '').trim().toLowerCase();
    const isConfirming = typeof body.code === 'string' && body.code.trim();
    const limit = await consumeRateLimit({
      scope: isConfirming ? 'email_bind_verify_user' : 'email_bind_send_user',
      subject: user.id,
      limit: isConfirming ? 20 : 5,
      windowMs: isConfirming ? 15 * 60 * 1000 : 60 * 60 * 1000,
    });
    if (!limit.allowed) return rateLimitResponse(limit);
    if (!isConfirming) {
      const targetLimit = await consumeRateLimit({
        scope: 'email_bind_send_target',
        subject: hashRateLimitSubject('email', email),
        limit: 5,
        windowMs: 60 * 60 * 1000,
      });
      if (!targetLimit.allowed) return rateLimitResponse(targetLimit);
    }

    const result = isConfirming
      ? await confirmEmailBinding({ userId: user.id, email, code: body.code, requestIp: getClientIp(request) })
      : await requestEmailBinding({ userId: user.id, email, requestIp: getClientIp(request) });
    if (result.error) {
      const status = result.error === 'EMAIL_ALREADY_BOUND' ? 409
        : result.error === 'EMAIL_VERIFICATION_NOT_CONFIGURED' || result.error === 'SMTP_NOT_CONFIGURED' || result.error === 'SMTP_UNAVAILABLE' ? 503
          : 400;
      return json({ error: result.message || '邮箱验证失败', code: result.error }, { status });
    }
    return json({
      success: true,
      email: result.email,
      verificationRequired: Boolean(result.verificationRequired),
      expiresInSeconds: result.expiresInSeconds || null,
      message: result.alreadyBound ? '该邮箱已完成绑定' : result.verificationRequired ? '验证码已发送，请查收邮件并完成确认' : '安全邮箱已成功绑定',
    }, { status: result.verificationRequired ? 202 : 200 });
  } catch (error) {
    const code = String(error?.code || 'EMAIL_BIND_FAILED').slice(0, 120);
    console.error('[bind email error]', { code });
    const status = ['EMAIL_VERIFICATION_NOT_CONFIGURED', 'SMS_SECRET_NOT_CONFIGURED', 'SMTP_NOT_CONFIGURED', 'SMTP_UNAVAILABLE'].includes(code) ? 503 : 500;
    return json({ error: status === 503 ? '邮箱验证服务暂不可用，请稍后重试' : '绑定安全邮箱失败', code }, { status });
  }
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    const result = await unbindUserEmail(user.id);
    if (result.error) {
      return json({ error: result.message }, { status: 400 });
    }
    return json({ success: true, message: result.message });
  } catch (error) {
    console.error('[unbind email error]', error);
    return json({ error: '解绑安全邮箱失败，请稍后重试' }, { status: 500 });
  }
}
