import { headers } from 'next/headers';
import CreationsClient from '@/components/creations/CreationsClient';
import { getLocaleConfig } from '@/lib/locales';

export const metadata = {
  title: '个人作品资产中心 — KoyoSIM AI Studio',
  description: '管理您的生图、生视频、生音乐等全部 AI 创作素材，支持一键分享至社区。',
};

export default async function CreationsPage() {
  // Passed down so the client never re-derives locale from a cookie: the
  // server already knows it (middleware.js), and a cookie-only read makes
  // the server render one language and hydration replace it with another.
  const locale = getLocaleConfig((await headers()).get('x-locale')).code;
  return <CreationsClient locale={locale} />;
}
