import { NextResponse } from 'next/server';
import { verifySmsCode } from '@/lib/sms';
import { findOrCreateUserByPhone, createSession, setSessionCookie, json } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const phone = String(body.phone || '').trim();
    const countryCode = String(body.countryCode || '+86').trim();
    const code = String(body.code || '').trim();
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';

    if (!phone) {
      return json({ error: '请输入手机号码' }, { status: 400 });
    }
    if (!code) {
      return json({ error: '请输入短信验证码' }, { status: 400 });
    }

    // 1. 校验验证码
    const verifyResult = await verifySmsCode({ phone, countryCode, code, type: 'login' });
    if (verifyResult.error) {
      return json({ error: verifyResult.error }, { status: 400 });
    }

    // 2. 获取或创建用户主体与 auth_accounts 凭据
    const result = await findOrCreateUserByPhone({
      phone,
      countryCode,
      registrationSource: 'phone_sms',
      ip
    });

    if (result.error) {
      return json({ error: result.message || '登录失败' }, { status: 403 });
    }

    const { user, isNew } = result;

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
        credits: Number(user.credits || 0),
        loginProviders: ['phone']
      },
      isNew
    });

    setSessionCookie(response, session.token, session.expires);
    return response;
  } catch (error) {
    console.error('[auth/phone/verify]', error);
    return json({ error: '登录验证失败，请稍后重试' }, { status: 500 });
  }
}
