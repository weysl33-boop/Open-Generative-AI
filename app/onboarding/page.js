import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUserBySession } from '@/lib/services/auth';
import { getCommonCopy, getLocaleConfig, normalizeLocale } from '@/lib/locales';
import { ONBOARDING_STEP_IDENTITY } from '@/lib/onboarding/schema';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';

export const dynamic = 'force-dynamic';

// 语言取 cookie / 用户档案而非 URL：/onboarding 只有无语言前缀这一棵树。
async function resolveViewer() {
  const cookieStore = await cookies();
  const user = await getUserBySession(cookieStore.get('ko_session')?.value);
  if (!user) return null;
  const locale = normalizeLocale(cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value || user.locale || 'en');
  return { user, locale };
}

export async function generateMetadata() {
  const viewer = await resolveViewer();
  const { identityTitle } = getCommonCopy(viewer?.locale || 'en').onboarding;
  return {
    title: `${identityTitle} — koyosim AI Studio`,
    robots: { index: false, follow: false },
  };
}

export default async function OnboardingPage() {
  const viewer = await resolveViewer();
  if (!viewer) redirect('/');
  const { user, locale } = viewer;

  const config = getLocaleConfig(locale);
  const studioHref = config.rootPath ? `${config.rootPath}/studio` : '/studio';

  // 画像只采集一次：完成后不再提供重填入口，否则「自述 vs 行为」的基线会被覆盖。
  if (user.onboardingCompleted) redirect(studioHref);

  return (
    <OnboardingFlow
      initialStep={user.onboardingStep >= ONBOARDING_STEP_IDENTITY ? 2 : 1}
      initialUser={{
        userNumber: user.userNumber || '',
        displayName: user.displayName || '',
        avatarUrl: user.avatar || '',
        locale,
      }}
      studioHref={studioHref}
    />
  );
}
