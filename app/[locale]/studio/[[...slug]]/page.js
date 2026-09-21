import { notFound } from 'next/navigation';
import StandaloneShell from '@/components/StandaloneShell';
import { assertOnboardingComplete } from '@/lib/onboarding/guard';
import { isSupportedLocale, normalizeLocale } from '@/lib/locales';
import { isStudioSlug } from '@/lib/studio-routes';

export const dynamic = 'force-dynamic';

export default async function LocalizedStudioPage({ params }) {
  const { locale, slug } = await params;
  if (!isSupportedLocale(locale) || normalizeLocale(locale) === 'en') notFound();
  if (!isStudioSlug(slug)) notFound();
  await assertOnboardingComplete();
  return <StandaloneShell locale={normalizeLocale(locale)} />;
}
