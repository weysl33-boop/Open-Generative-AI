import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';

export const metadata = {
  title: '我的资产库 — koyosim',
  description: '个人私有 AI 创作资产库，管理生成素材、提示词与两级子文件夹分类。',
};

export default async function AssetsPage() {
  // `assets` 不是工作台段，旧链接只能落到 studio 根上再由壳决定显示什么。
  // 语言取 x-locale：middleware 已经按"路径 → ?lang → cookie"算过一遍，
  // 在这里再读一次 cookie 就是给同一件事第二个优先级。
  const config = getLocaleConfig(normalizeLocale((await headers()).get('x-locale')));
  redirect(`${config.rootPath}/studio`);
}
