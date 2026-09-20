import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';

export const metadata = {
  title: '我的资产库 — koyosim',
  description: '个人私有 AI 创作资产库，管理生成素材、提示词与两级子文件夹分类。',
};

export default async function AssetsPage() {
  const cookieStore = await cookies();
  const headerList = await headers();

  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;
  const headerLocale = headerList.get('x-locale');
  const targetLocale = normalizeLocale(cookieLocale || headerLocale || 'zh');

  const config = getLocaleConfig(targetLocale);
  const rootPath = config?.rootPath || '';

  redirect(`${rootPath}/studio/assets`);
}
