import { headers } from 'next/headers';
import StandaloneShell from '@/components/StandaloneShell';
import { normalizeLocale } from '@/lib/locales';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Workflow — koyosim',
  // 分享链接之外没有入口，正文又是工作台壳：让它进索引只会产出一个和 /studio 抢词的 URL。
  robots: { index: false, follow: false },
};

export default async function WorkflowPage() {
  // x-locale 由 middleware 按"路径 → ?lang → cookie"定出，是全站唯一的服务端语言答案。
  const locale = normalizeLocale((await headers()).get('x-locale'));
  return <StandaloneShell locale={locale} />;
}
