import StandaloneShell from '@/components/StandaloneShell';
import { assertOnboardingComplete } from '@/lib/onboarding/guard';

export const metadata = {
  title: 'Studio — koyosim',
};

export default async function ZhStudioPage() {
  await assertOnboardingComplete();
  return <StandaloneShell locale="zh-CN" />;
}
