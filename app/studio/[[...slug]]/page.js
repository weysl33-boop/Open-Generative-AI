import { notFound, redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import { assertOnboardingComplete } from '@/lib/onboarding/guard';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';
import { isStudioSlug } from '@/lib/studio-routes';

export const metadata = {
  title: 'Studio — koyosim',
};

export default async function StudioPage({ params }) {
  const resolvedParams = (await params) || {};
  const slug = resolvedParams.slug;
  if (!isStudioSlug(slug)) notFound();

  await assertOnboardingComplete();

  const cookieStore = await cookies();
  const headerList = await headers();

  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;
  const headerLocale = headerList.get('x-locale');
  const targetLocale = normalizeLocale(cookieLocale || headerLocale || 'en');

  // 若用户偏好为非英文，自动服务端重定向至对应的多语言专属路由
  if (targetLocale !== 'en') {
    const config = getLocaleConfig(targetLocale);
    if (config?.rootPath) {
      const slugPath = Array.isArray(slug) && slug.length > 0 ? `/${slug.join('/')}` : '';
      redirect(`${config.rootPath}/studio${slugPath}`);
    }
  }

  return <StandaloneShell locale="en" />;
}
