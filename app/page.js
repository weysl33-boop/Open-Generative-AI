import { redirect } from 'next/navigation';
import { cookies, headers } from 'next/headers';
import { getLocaleConfig, normalizeLocale } from '@/lib/locales';

export default async function Home() {
  const cookieStore = await cookies();
  const headerList = await headers();

  const cookieLocale = cookieStore.get('NEXT_LOCALE')?.value || cookieStore.get('locale')?.value;
  const headerLocale = headerList.get('x-locale');
  const targetLocale = normalizeLocale(cookieLocale || headerLocale || 'en');

  const config = getLocaleConfig(targetLocale);
  const targetPath = config.rootPath ? `${config.rootPath}/studio` : '/studio';

  redirect(targetPath);
}
