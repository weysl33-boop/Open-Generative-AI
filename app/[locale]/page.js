import { notFound, redirect } from 'next/navigation';
import { isSupportedLocale, normalizeLocale } from '@/lib/locales';

export default async function LocalizedHome({ params }) {
  const { locale } = await params;
  if (!isSupportedLocale(locale) || normalizeLocale(locale) === 'en') notFound();
  redirect(`/${locale}/studio`);
}
