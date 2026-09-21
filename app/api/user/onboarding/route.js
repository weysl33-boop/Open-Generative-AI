import { NextResponse } from 'next/server';
import {
  getUserFromRequest,
  submitOnboardingIdentity,
  submitOnboardingPreferences,
  submitOnboardingSkip,
  submitUserOnboarding,
} from '@/lib/services/auth.js';
import { ONBOARDING_STEP_PREFERENCE } from '@/lib/onboarding/schema.js';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

const FIELD_ERRORS = new Set([
  'ONBOARDING_INVALID_NICKNAME',
  'ONBOARDING_INVALID_ANSWERS',
  'ONBOARDING_INVALID_AVATAR',
  'ONBOARDING_FIELD_TOO_LONG',
]);

// 中文只用于日志与旧客户端兜底；引导页按 code 取自己语言包里的文案。
const fail = (code, message, status) => NextResponse.json({ error: message, code }, { status });

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录后再提交偏好信息', code: 'UNAUTHORIZED' }, { status: 401 });
    }

    const guarded = guardMutation(request, { maxBytes: 64 * 1024 });
    if (guarded) return guarded;

    const body = await request.json().catch(() => ({}));
    const step = Number(body.step ?? ONBOARDING_STEP_PREFERENCE);
    // 旧版一次性问卷仍要能提交，components/auth/UserOnboardingModal 走的是这条路径。
    // 但它会把空请求体也算成「已完成」，所以必须看到旧字段才放行。
    const legacy = body.preferences !== undefined || body.zodiac !== undefined
      || body.industry !== undefined || body.occupation !== undefined;

    if (step !== 1 && step !== ONBOARDING_STEP_PREFERENCE) {
      return fail('ONBOARDING_INVALID_STEP', '未知的引导步骤', 422);
    }

    let result;
    if (body.skip === true) {
      result = await submitOnboardingSkip({ userId: user.id });
    } else if (step === 1) {
      result = await submitOnboardingIdentity({
        userId: user.id,
        displayName: body.displayName,
        avatarUrl: body.avatarUrl,
        fallbackDisplayName: user.displayName,
      });
    } else if (body.answers) {
      result = await submitOnboardingPreferences({ userId: user.id, answers: body.answers });
    } else if (legacy) {
      result = await submitUserOnboarding({
        userId: user.id,
        displayName: body.displayName,
        fallbackDisplayName: user.displayName,
        zodiac: body.zodiac,
        industry: body.industry,
        occupation: body.occupation,
        preferences: body.preferences,
      });
    } else {
      return fail('ONBOARDING_INVALID_ANSWERS', '请提交第二步的习惯偏好答案', 422);
    }

    return NextResponse.json({
      ok: true,
      data: {
        userId: user.id,
        step,
        displayName: result.profile.display_name,
        avatarUrl: result.profile.avatar_url,
        personaCode: result.personaCode ?? result.profile.creator_persona_code ?? null,
        onboardingCompleted: result.profile.onboarding_completed === true,
        tagIds: result.tagIds,
        rewardCredits: Number(result.rewardCredits || 0),
        skipped: result.skipped === true,
      },
    });
  } catch (error) {
    console.error('[api/user/onboarding]', { code: error.code || 'ONBOARDING_FAILED', error });
    const status = FIELD_ERRORS.has(error.code) ? 422 : error.code === 'USER_NOT_FOUND' ? 404 : 500;
    return fail(error.code || 'ONBOARDING_FAILED', publicErrorMessage(error, '保存偏好设置失败，请稍后重试'), status);
  }
}
