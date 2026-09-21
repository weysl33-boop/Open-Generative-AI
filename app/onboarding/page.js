import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { getUserBySession } from '@/lib/services/auth';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';
import { ONBOARDING_STEP_IDENTITY } from '@/lib/onboarding/schema';
import OnboardingFlow from '@/components/onboarding/OnboardingFlow';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '完善创作者资料 — koyosim AI Studio',
  robots: { index: false, follow: false },
};

export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const user = await getUserBySession(cookieStore.get('ko_session')?.value);
  if (!user) redirect('/');

  const storedLocale = normalizeLocale(cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value || user.locale || 'en');
  const config = getLocaleConfig(storedLocale);
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
        locale: storedLocale,
      }}
      studioHref={studioHref}
    />
  );
}
