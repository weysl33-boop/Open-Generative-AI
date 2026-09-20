// Locale registry for the standalone koyosim studio app.
//
// This mirrors the additive-route architecture documented in the main
// muapi client (../../../docs/localization.md): English stays the
// default, unprefixed route tree; every other locale gets a parallel
// `/[[locale]]/...` route tree that reuses the same components with
// translated copy passed as a prop. There is no i18n routing library
// (no next-intl) — just a registry + plain JSON message bundles + a
// recursive merge so a partial translation still renders (falls back to
// English for any missing key).
//
// Adding a new locale: register it here with its message imports, then
// add a matching `app/<locale>/...` route wrapper tree that passes
// `locale="<locale>"` into the shared components. Do not add
// `locale === 'zh'`-style branches in shared components — read copy from
// this registry instead.
import enCommon from '../messages/en/common.json';
import zhCommon from '../messages/zh/common.json';
import jaCommon from '../messages/ja-JP/common.json';
import koCommon from '../messages/ko-KR/common.json';
import zhTwCommon from '../messages/zh-TW/common.json';
import esCommon from '../messages/es/common.json';

export const DEFAULT_LOCALE = 'en';

// Locale values are deliberately kept as stable English identifiers. The
// legacy `zh` value remains an input alias for backwards compatibility, but
// all new state and responses use the explicit BCP-47 locale `zh-CN`.
export const LOCALE_ALIASES = {
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-tw': 'zh-TW',
  ja: 'ja-JP',
  ko: 'ko-KR',
  es: 'es',
  'es-es': 'es',
  'es-la': 'es',
  'es-mx': 'es',
  'es-ar': 'es',
};

export const LOCALE_CONFIGS = {
  en: {
    code: 'en',
    nativeName: 'English',
    htmlLang: 'en',
    rootPath: '',
    messages: {
      common: enCommon,
    },
  },
  'zh-CN': {
    code: 'zh-CN',
    nativeName: '简体中文',
    htmlLang: 'zh-CN',
    rootPath: '/zh',
    messages: {
      common: zhCommon,
    },
  },
  'ja-JP': {
    code: 'ja-JP',
    nativeName: '日本語',
    htmlLang: 'ja-JP',
    rootPath: '/ja-JP',
    messages: {
      common: jaCommon,
    },
  },
  'ko-KR': {
    code: 'ko-KR',
    nativeName: '한국어',
    htmlLang: 'ko-KR',
    rootPath: '/ko-KR',
    messages: {
      common: koCommon,
    },
  },
  'zh-TW': {
    code: 'zh-TW',
    nativeName: '繁體中文',
    htmlLang: 'zh-TW',
    rootPath: '/zh-TW',
    messages: {
      common: zhTwCommon,
    },
  },
  es: {
    code: 'es',
    nativeName: 'Español',
    htmlLang: 'es',
    rootPath: '/es',
    messages: {
      common: esCommon,
    },
  },
};

export const SUPPORTED_LOCALES = Object.keys(LOCALE_CONFIGS);

export function normalizeLocale(locale) {
  const value = String(locale || '').trim();
  if (LOCALE_CONFIGS[value]) return value;
  return LOCALE_ALIASES[value.toLowerCase()] || DEFAULT_LOCALE;
}

export function isSupportedLocale(locale) {
  const value = String(locale || '').trim();
  return Boolean(value) && (Object.prototype.hasOwnProperty.call(LOCALE_CONFIGS, value)
    || Object.prototype.hasOwnProperty.call(LOCALE_ALIASES, value.toLowerCase()));
}

// Registered locale prefixes, longest first, so `/zh-CN` (if ever added)
// would not falsely match under a shorter `/zh` prefix check.
const LOCALE_PREFIXES = Object.values(LOCALE_CONFIGS)
  .filter((config) => config.rootPath)
  .map((config) => config.rootPath)
  .sort((a, b) => b.length - a.length);

// Mirrors client/lib's getLocaleFromPathname pattern: derive the active
// locale purely from the URL path, no cookies/headers/negotiation.
export function getLocaleFromPathname(pathname) {
  if (!pathname) return DEFAULT_LOCALE;
  for (const prefix of LOCALE_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) {
      const locale = Object.values(LOCALE_CONFIGS).find((c) => c.rootPath === prefix);
      return locale?.code || DEFAULT_LOCALE;
    }
  }
  const firstSegment = pathname.split('/')[1];
  if (firstSegment && isSupportedLocale(firstSegment)) {
    return normalizeLocale(firstSegment);
  }
  return DEFAULT_LOCALE;
}

export function getLocaleConfig(locale) {
  return LOCALE_CONFIGS[normalizeLocale(locale)] || LOCALE_CONFIGS[DEFAULT_LOCALE];
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Generic recursive merge: translated arrays replace the English array
// wholesale (locale-owned unit), plain objects merge key-by-key so a
// partial bundle still falls back to English per-key rather than
// per-namespace.
export function mergeCopy(base, override) {
  if (!override) return base;
  if (!base) return override;
  if (!isPlainObject(base) || !isPlainObject(override)) return override;

  const merged = { ...base };
  for (const key of Object.keys(override)) {
    merged[key] = isPlainObject(base[key]) && isPlainObject(override[key])
      ? mergeCopy(base[key], override[key])
      : override[key];
  }
  return merged;
}

// Returns the `common` namespace for a locale, merged over the English
// defaults so every key is always present.
export function getCommonCopy(locale) {
  const config = getLocaleConfig(locale);
  if (config.code === DEFAULT_LOCALE) return LOCALE_CONFIGS[DEFAULT_LOCALE].messages.common;
  return mergeCopy(LOCALE_CONFIGS[DEFAULT_LOCALE].messages.common, config.messages.common);
}

// Loads and merges a per-studio-tab namespace (messages/{locale}/studio/{tabId}.json)
// over its English default. Namespaces are loaded lazily by each Studio
// component (`getStudioCopy('imageStudio', enBundle, zhBundle, locale)`)
// so this file doesn't need to import every tab's bundle up front.
export function resolveStudioCopy(enBundle, localeBundle, locale) {
  if (locale === DEFAULT_LOCALE) return enBundle;
  return mergeCopy(enBundle, localeBundle);
}

// Builds the studio path for a given tab under the active locale's root,
// e.g. localizeStudioPath('zh', 'video') -> '/zh/studio/video'.
export function localizeStudioPath(locale, tabId) {
  const config = getLocaleConfig(locale);
  const suffix = tabId ? `/studio/${tabId}` : '/studio';
  return `${config.rootPath}${suffix}`;
}
