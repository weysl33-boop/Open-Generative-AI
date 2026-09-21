import { getLocaleConfig, matchPathLocale, normalizeLocale, resolveClientLocale } from '@/lib/locales';
import { LOCALIZED_PATHS, PREFIX_AGNOSTIC_BASES } from '@/lib/routePolicy';

// 语言切换的唯一实现。之前有两份各自漂移的拷贝
// （components/LanguageSwitcher.js、components/UserDropdownMenu.js），
// 两边的"非 studio 路径就整页 reload"分支在只有 /zh 建了树的事实下必然分叉。

const COOKIE_MAX_AGE = 31536000;

/** 去掉路径自己声明的语言前缀，得到跨语言可复用的基路径。 */
export function stripLocalePrefix(pathname) {
  const path = pathname || '/';
  if (!matchPathLocale(path)) return path;
  const asserted = `/${path.split('/')[1]}`;
  return path.slice(asserted.length) || '/';
}

/**
 * 这个基路径在目标语言下能不能解析出路由：该前缀真建了字面树，或者它由
 * `app/[locale]/**` 服务。都不满足时返回 null —— 拼一个 `${prefix}${base}` 出去就是一发 404，
 * 而那正是旧实现里"非 studio 路径就 reload"想躲开又没躲开的东西。
 */
export function localizedPathFor(basePath, targetLocale) {
  const root = getLocaleConfig(targetLocale).rootPath;
  // 无前缀树就是整站，任何基路径都在它下面。
  if (!root) return basePath;
  const top = basePath.split('/')[1];
  if (!top) return root;
  const reachable = PREFIX_AGNOSTIC_BASES.includes(top) || (LOCALIZED_PATHS[root] || []).includes(top);
  return reachable ? `${root}${basePath}` : null;
}

/**
 * 组件侧的可直接用版本：解析当前激活语言，再给 basePath 拼前缀；
 * 该路径在当前语言下没有树时退回无前缀 canonical（由中间件 307 兜到该语言）。
 */
export function localizedHref(basePath, { explicit, pathname, search, userLocale } = {}) {
  const active = resolveClientLocale({ explicit, pathname, search, userLocale });
  return localizedPathFor(basePath, active) ?? basePath;
}

/** 写 cookie 与个人偏好：语言由 URL 表达的那些页面也依赖它，切前缀之外的路径要用。 */
export function persistLocale(targetLocale) {
  const value = encodeURIComponent(targetLocale);
  document.cookie = `NEXT_LOCALE=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;
  document.cookie = `locale=${value}; path=/; max-age=${COOKIE_MAX_AGE}; SameSite=Lax`;

  // 登录态下把偏好落到用户记录；未登录时这两个接口各自 401，静默即可。
  void fetch('/api/user/preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: targetLocale }),
  }).catch(() => {});
  void fetch('/api/user/profile', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ locale: targetLocale }),
  }).catch(() => {});
}

/**
 * 就地换语言：有本地化路由就整页导航过去（HTML 的 lang 与服务端文案都要重出），
 * 没有就留在当前 URL，写 cookie 后 refresh 让服务端按新语言重渲染。
 * 返回值说清走了哪条路，便于两边行为一致、也便于测试。
 */
export function switchLocale({ targetLocale, pathname, search = '' }) {
  const locale = normalizeLocale(targetLocale);
  persistLocale(locale);
  const target = localizedPathFor(stripLocalePrefix(pathname), locale);
  if (target === null) {
    window.location.reload();
    return { locale, navigated: false };
  }
  window.location.href = `${target === '/' ? '' : target}${search}` || '/';
  return { locale, navigated: true };
}
