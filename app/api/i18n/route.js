import { NextResponse } from 'next/server';
import { getCommonCopy, isSupportedLocale, normalizeLocale, SUPPORTED_LOCALES } from '@/lib/locales';
import { getPublishedCatalogOverrides } from '@/lib/services/i18n';
import { buildMessagesFromCatalog, loadStaticCatalogs } from '@/lib/i18nCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const requested = new URL(request.url).searchParams.get('locale');
  const locale = normalizeLocale(requested);
  if (!requested || !isSupportedLocale(requested) || !SUPPORTED_LOCALES.includes(locale)) {
    return NextResponse.json({ error: 'Unsupported locale' }, { status: 400 });
  }
  const [catalogs, published] = await Promise.all([loadStaticCatalogs(), getPublishedCatalogOverrides()]);
  const overrides = published?.[locale] || {};
  const effectiveCatalog = { ...(catalogs[locale] || {}), ...overrides };
  const catalog = buildMessagesFromCatalog(effectiveCatalog);
  return NextResponse.json(
    { locale, messages: catalog.common || getCommonCopy(locale), catalog },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
