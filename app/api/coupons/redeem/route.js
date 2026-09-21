import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { redeemCoupon } from '@/lib/services/coupons';
import { consumeRateLimit, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return NextResponse.json({ error: '请先登录后再进行兑换' }, { status: 401 });
  }

  try {
    const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
    if (guarded) return guarded;
    const limit = await consumeRateLimit({ scope: 'coupon_redeem_user', subject: user.id, limit: 20, windowMs: 24 * 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const body = await request.json();
    const code = body.code;
    const result = await redeemCoupon({ code, user });

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[coupons/redeem]', error);
    return NextResponse.json({ error: '兑换处理异常' }, { status: 500 });
  }
}
