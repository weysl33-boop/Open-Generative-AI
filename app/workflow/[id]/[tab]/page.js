import { headers } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import { normalizeLocale } from '@/lib/locales';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Workflow — koyosim',
  robots: { index: false, follow: false },
};

export default async function WorkflowTabPage() {
  const locale = normalizeLocale((await headers()).get('x-locale'));
  return <StandaloneShell locale={locale} />;
}
