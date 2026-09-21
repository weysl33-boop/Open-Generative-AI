import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { createRequire } from 'module';
import { DEFAULT_LOCALE, LOCALE_CONFIGS, normalizeLocale } from '../lib/locales.js';
import { getPublishedCatalogOverrides } from '../lib/services/i18n.js';
import { mergeCommonMessages } from '../lib/i18nCatalog.js';

const require = createRequire(import.meta.url);
const enMessages = require('../messages/en/common.json');
const zhMessages = require('../messages/zh/common.json');
const jaMessages = require('../messages/ja-JP/common.json');
const koMessages = require('../messages/ko-KR/common.json');
const zhTwMessages = require('../messages/zh-TW/common.json');
const esMessages = require('../messages/es/common.json');

const MESSAGES = {
  en: enMessages,
  'zh-CN': zhMessages,
  'ja-JP': jaMessages,
  'ko-KR': koMessages,
  'zh-TW': zhTwMessages,
  es: esMessages,
};

export default getRequestConfig(async () => {
  let locale = DEFAULT_LOCALE;

  try {
    const headerList = await headers();
    const cookieStore = await cookies();

    const headerLocale = headerList.get('x-locale');
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;

    const requestedLocale = headerLocale || cookieLocale;
    if (requestedLocale && LOCALE_CONFIGS[normalizeLocale(requestedLocale)]) {
      locale = normalizeLocale(requestedLocale);
    }
  } catch (err) {
    // fallback en
  }

  const published = await getPublishedCatalogOverrides();
  const publishedCommon = Object.fromEntries(
    Object.entries(published?.[locale] || {}).filter(([key]) => key.startsWith('common.')),
  );
  const messages = mergeCommonMessages(MESSAGES[locale] || MESSAGES[DEFAULT_LOCALE], publishedCommon);

  return {
    locale,
    messages,
  };
});
