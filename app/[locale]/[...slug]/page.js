import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { getLocaleConfig, isSupportedLocale } from '@/lib/locales';
import { LOCALIZED_PATHS, UNPREFIXED_TOP_SEGMENTS } from '@/lib/routePolicy';

/**
 * 语言前缀的兜底页：`/{任何已注册语言}/{其余段}` 走到这里，
 * 前提是那些段在 app/ 树里没有更具体的匹配（静态段永远优先于 `[locale]`）。
 *
 * 判定顺序不能换：先拒未知语言，再把别名 308 成规范前缀，最后才降级到无前缀。
 * 反过来会给 `/xx/乱码` 一个本地化味的 307，等于把 404 变成一次跳转。
 *
 * 这里**不读 cookie / header**：路径说什么语言就是什么语言。让 cookie 参与决定
 * 一个带前缀的 URL 该渲染什么，正是 `/studio` 对非中文用户永远打不开的那个病根。
 */
export default async function LocalizedFallback({ params, searchParams }) {
  const { locale, slug } = await params;
  const query = new URLSearchParams(await searchParams).toString();
  const suffix = query ? `?${query}` : '';
  const rest = (slug || []).filter(Boolean);
  const path = rest.join('/');

  if (!isSupportedLocale(locale)) notFound();

  const config = getLocaleConfig(locale);
  // 别名前缀（`ja`、`zh-CN`、`es-ES`…）在中间件就已经 308 走了；留这一条是给
  // 中间件matcher 之外的入口兜底 —— 同一件事只该有一个规范 URL。
  if (locale !== config.rootPath.slice(1)) {
    permanentRedirect(`${config.rootPath}/${path}${suffix}`);
  }

  // 这个前缀下真建了树的路径不降级：/zh/credits/foo 应该 404，
  // 而不是被偷偷送到无前缀的 /credits/foo。
  if ((LOCALIZED_PATHS[config.rootPath] || []).includes(rest[0])) notFound();

  // 前缀下没建树、但无前缀树里有的那些，就地换语言由 cookie 承载 —— 307 而不是 308：
  // 今天 /ja/pricing 没有日文正文，明天补上了这条跳转就该消失，不该被浏览器永久缓存。
  if (UNPREFIXED_TOP_SEGMENTS.includes(rest[0])) {
    redirect(`/${path}${suffix}`);
  }

  notFound();
}
