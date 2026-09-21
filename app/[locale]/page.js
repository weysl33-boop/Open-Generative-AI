import { notFound, redirect } from 'next/navigation';
import { getLocaleConfig, isSupportedLocale } from '@/lib/locales';

export default async function LocalizedHome({ params }) {
  const { locale } = await params;
  const config = getLocaleConfig(locale);
  // 只认注册表里真带前缀的语言：`en` 的 rootPath 是空的，`/en` 应该 404 而不是
  // 跳去一个拼出来的 `/en/studio`。别名（ja、zh-CN、es-ES）由中间件先 308 规范化，
  // 这里再用 rootPath 拼一次，是为了让这个页面自己也不依赖 params 的原样写法。
  if (!isSupportedLocale(locale) || !config.rootPath) notFound();
  redirect(`${config.rootPath}/studio`);
}
