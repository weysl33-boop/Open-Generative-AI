import { NextResponse } from 'next/server';
import { getUserFromRequest, submitUserOnboarding } from '@/lib/services/auth.js';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录后再提交偏好信息' }, { status: 401 });
    }

    const guarded = guardMutation(request, { maxBytes: 64 * 1024 });
    if (guarded) return guarded;

    const body = await request.json().catch(() => ({}));
    const result = await submitUserOnboarding({
      userId: user.id,
      displayName: body.displayName,
      fallbackDisplayName: user.displayName,
      zodiac: body.zodiac,
      industry: body.industry,
      occupation: body.occupation,
      preferences: body.preferences,
    });

    return NextResponse.json({
      ok: true,
      message: '用户互动画像与偏好习惯保存成功',
      data: {
        userId: user.id,
        displayName: result.profile.display_name,
        zodiac: result.profile.zodiac,
        industry: result.profile.industry,
        occupation: result.profile.occupation,
        preferences: result.profile.preferences_json ?? {},
        tagIds: result.tagIds,
      },
    });
  } catch (error) {
    console.error('[api/user/onboarding]', { code: error.code || 'ONBOARDING_FAILED', error });
    const status = error.code === 'ONBOARDING_FIELD_TOO_LONG' ? 422 : 500;
    return NextResponse.json({ error: publicErrorMessage(error, '保存偏好设置失败，请稍后重试') }, { status });
  }
}
