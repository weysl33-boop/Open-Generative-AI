import { headers } from 'next/headers';
import CommunityClient from '@/components/community/CommunityClient';
import { getLocaleConfig } from '@/lib/locales';

export const metadata = {
  title: '社区 — 探索 AI 艺术灵感与一键做同款 | KoyoSIM AI Studio',
  description: '汇聚生图、生视频、生音乐等前沿 AI 艺术创作，支持查看提示词与参数，一键同款生成。',
};

export default async function CommunityPage() {
  // Passed down so the client never re-derives locale from a cookie: the
  // server already knows it (middleware.js), and a cookie-only read makes
  // the server render one language and hydration replace it with another.
  const locale = getLocaleConfig((await headers()).get('x-locale')).code;
  return <CommunityClient locale={locale} />;
}
