import { NextResponse } from 'next/server';
import { sendSmsVerificationCode } from '@/lib/sms';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const body = await request.json();
    const phone = String(body.phone || '').trim();
    const countryCode = String(body.countryCode || '+86').trim();
    const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || '127.0.0.1';

    if (!phone) {
      return NextResponse.json({ error: '请输入手机号码' }, { status: 400 });
    }

    const result = await sendSmsVerificationCode({ phone, countryCode, type: 'login', ip });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      notice: result.notice,
      expiresInSeconds: result.expiresInSeconds,
      devCode: result.devCode
    });
  } catch (error) {
    console.error('[auth/phone/send-code]', error);
    return NextResponse.json({ error: '验证码发送失败，请稍后重试' }, { status: 500 });
  }
}
