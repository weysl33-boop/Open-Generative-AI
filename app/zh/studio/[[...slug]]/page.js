import { notFound } from 'next/navigation';
import StandaloneShell from '@/components/StandaloneShell';
import { assertOnboardingComplete } from '@/lib/onboarding/guard';
import { isStudioSlug } from '@/lib/studio-routes';

export const metadata = {
  title: 'Studio — koyosim',
};

export default async function ZhStudioPage({ params }) {
  const { slug } = (await params) || {};
  if (!isStudioSlug(slug)) notFound();
  await assertOnboardingComplete();
  return <StandaloneShell locale="zh-CN" />;
}
