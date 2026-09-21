import Link from 'next/link';
import { headers } from 'next/headers';
import { Compass, Home, Sparkles } from 'lucide-react';
import { getLocaleConfig, localizeStudioPath, resolveStudioCopy } from '@/lib/locales';
import enCopy from '../messages/en/not-found.json';
import zhCopy from '../messages/zh/not-found.json';
import jaCopy from '../messages/ja-JP/not-found.json';
import koCopy from '../messages/ko-KR/not-found.json';
import zhTwCopy from '../messages/zh-TW/not-found.json';
import esCopy from '../messages/es/not-found.json';

// 404 是唯一必须在"这个语言根本没建树"的场合也能说话的页面 —— 走到这里的请求
// 恰恰都是路径语言判定失败的那批，所以文案按 x-locale 出，而不是按 URL 前缀。
const BUNDLES = {
  en: enCopy,
  'zh-CN': zhCopy,
  'ja-JP': jaCopy,
  'ko-KR': koCopy,
  'zh-TW': zhTwCopy,
  es: esCopy,
};

export default async function RootNotFound() {
  const locale = getLocaleConfig((await headers()).get('x-locale')).code;
  const copy = resolveStudioCopy(enCopy, BUNDLES[locale], locale);
  const rootPath = getLocaleConfig(locale).rootPath;

  return (
    <main className="flex min-h-screen items-center justify-center bg-canvas px-6 py-24">
      <meta name="robots" content="noindex, follow" />
      <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-10 text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-xl border border-brand-line bg-brand-soft text-brand">
          <Compass className="size-7" />
        </div>
        <p className="mt-6 text-caption font-semibold uppercase tracking-widest text-brand">404</p>
        <h1 className="mt-2 text-section-title text-ink">{copy.title}</h1>
        <p className="mt-3 text-body-sm leading-6 text-ink-muted">{copy.description}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href={localizeStudioPath(locale)}
            className="inline-flex h-control-md items-center gap-1.5 rounded-lg bg-brand px-5 text-label font-semibold text-ink-on-accent transition-colors duration-base hover:bg-brand-hover"
          >
            <Sparkles className="size-3.5" />
            {copy.openStudio}
          </Link>
          <Link
            href={rootPath || '/'}
            className="inline-flex h-control-md items-center gap-1.5 rounded-lg border border-line bg-raised px-5 text-label font-semibold text-ink transition-colors duration-base hover:border-brand-line"
          >
            <Home className="size-3.5" />
            {copy.backHome}
          </Link>
        </div>
      </div>
    </main>
  );
}
