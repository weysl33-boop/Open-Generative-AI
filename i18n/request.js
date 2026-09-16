import { getRequestConfig } from 'next-intl/server';
import { cookies, headers } from 'next/headers';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const enMessages = require('../messages/en/common.json');
const zhMessages = require('../messages/zh/common.json');

const MESSAGES = {
  en: enMessages,
  zh: zhMessages,
};

export default getRequestConfig(async () => {
  let locale = 'en';

  try {
    const headerList = await headers();
    const cookieStore = await cookies();

    const headerLocale = headerList.get('x-locale');
    const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;

    if (headerLocale === 'zh' || headerLocale === 'en') {
      locale = headerLocale;
    } else if (cookieLocale === 'zh' || cookieLocale === 'en') {
      locale = cookieLocale;
    }
  } catch (err) {
    // fallback en
  }

  return {
    locale,
    messages: MESSAGES[locale] || MESSAGES.en,
  };
});
