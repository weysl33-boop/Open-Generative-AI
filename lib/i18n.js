import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const enMessages = require('../messages/en/common.json');
const zhMessages = require('../messages/zh/common.json');
const jaMessages = require('../messages/ja-JP/common.json');
const koMessages = require('../messages/ko-KR/common.json');
const zhTwMessages = require('../messages/zh-TW/common.json');
const esMessages = require('../messages/es/common.json');

export const DEFAULT_LOCALE = 'en';
export const SUPPORTED_LOCALES = ['en', 'zh-CN', 'ja-JP', 'ko-KR', 'zh-TW', 'es'];
const LOCALE_ALIASES = {
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

function normalizeLocale(locale) {
  const value = String(locale || '').trim();
  return SUPPORTED_LOCALES.includes(value) ? value : (LOCALE_ALIASES[value.toLowerCase()] || DEFAULT_LOCALE);
}

export const LOCALE_LABELS = {
  en: 'English',
  'zh-CN': '简体中文',
  'ja-JP': '日本語',
  'ko-KR': '한국어',
  'zh-TW': '繁體中文',
  es: 'Español',
};

export const MESSAGES_MAP = {
  en: enMessages,
  'zh-CN': zhMessages,
  'ja-JP': jaMessages,
  'ko-KR': koMessages,
  'zh-TW': zhTwMessages,
  es: esMessages,
};

export function getRequestLocale(request) {
  if (!request) return DEFAULT_LOCALE;
  try {
    const url = new URL(request.url);
    const queryLang = url.searchParams.get('lang') || url.searchParams.get('locale');
    if (queryLang && SUPPORTED_LOCALES.includes(normalizeLocale(queryLang))) {
      return normalizeLocale(queryLang);
    }
    const headerLocale = request.headers?.get?.('x-locale');
    if (headerLocale && SUPPORTED_LOCALES.includes(normalizeLocale(headerLocale))) {
      return normalizeLocale(headerLocale);
    }
    const cookieHeader = request.headers?.get?.('cookie') || '';
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)(?:NEXT_LOCALE|locale)=([^;]+)/);
      if (match && match[1]) {
        const cVal = normalizeLocale(decodeURIComponent(match[1]));
        if (SUPPORTED_LOCALES.includes(cVal)) return cVal;
      }
    }
    const acceptLang = request.headers?.get?.('accept-language');
    if (acceptLang) {
      const lower = acceptLang.toLowerCase();
      if (lower.startsWith('zh-tw') || lower.includes(',zh-tw')) return 'zh-TW';
      if (lower.startsWith('zh') || lower.includes(',zh-cn') || lower.includes(',zh')) return 'zh-CN';
      if (lower.startsWith('ja') || lower.includes(',ja')) return 'ja-JP';
      if (lower.startsWith('ko') || lower.includes(',ko')) return 'ko-KR';
      if (lower.startsWith('es') || lower.includes(',es')) return 'es';
      if (lower.startsWith('en') || lower.includes(',en')) return DEFAULT_LOCALE;
    }
  } catch (err) {}
  return DEFAULT_LOCALE;
}

function resolveKey(messages, key) {
  if (!messages || !key) return null;
  const parts = key.split('.');
  let current = messages;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in current) {
      current = current[part];
    } else {
      return null;
    }
  }
  return typeof current === 'string' ? current : null;
}

export function createTranslator(locale = DEFAULT_LOCALE) {
  const normalizedLocale = normalizeLocale(locale);
  const currentLocale = SUPPORTED_LOCALES.includes(normalizedLocale) ? normalizedLocale : DEFAULT_LOCALE;
  const activeMessages = MESSAGES_MAP[currentLocale] || MESSAGES_MAP.en;
  const fallbackMessages = MESSAGES_MAP.en;
  return function t(key, params = {}) {
    let template = resolveKey(activeMessages, key);
    if (!template && currentLocale !== DEFAULT_LOCALE) {
      template = resolveKey(fallbackMessages, key);
    }
    if (!template) return key;
    if (params && typeof params === 'object') {
      return template.replace(/\{([^{}]+)\}/g, (m, name) => {
        const k = name.trim();
        return k in params ? String(params[k]) : m;
      });
    }
    return template;
  };
}

export function getApiI18n(request) {
  const locale = getRequestLocale(request);
  const t = createTranslator(locale);
  return { locale, t };
}
