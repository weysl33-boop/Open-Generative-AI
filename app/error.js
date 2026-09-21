'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { mergeCopy, matchPathLocale, normalizeLocale, localizeStudioPath } from '@/lib/locales';
import { reloadBypassingCache } from '@/lib/client/reloadBudget';
import enCopy from '../messages/en/error.json';
import zhCopy from '../messages/zh/error.json';
import jaCopy from '../messages/ja-JP/error.json';
import koCopy from '../messages/ko-KR/error.json';
import zhTwCopy from '../messages/zh-TW/error.json';
import esCopy from '../messages/es/error.json';

const BUNDLES = {
  en: enCopy,
  'zh-CN': zhCopy,
  'ja-JP': jaCopy,
  'ko-KR': koCopy,
  'zh-TW': zhTwCopy,
  es: esCopy,
};

/**
 * 根页面级错误边界。
 *
 * 只上报、不自动重载：自动 reload 曾经和 global-error / ChunkSelfHealing 各记各的
 * 冷却时间，一次故障会在两个边界之间被反复触发成刷新循环。恢复动作交回用户点击，
 * 三条路径共用同一份预算（lib/client/reloadBudget.js）。
 */
export default function ErrorBoundary({ error }) {
  const pathname = usePathname();
  useEffect(() => {
    console.error('[Page Error Caught]:', error);
  }, [error]);

  // 错误边界拿不到 cookie，也不该拿：路径前缀说什么语言就按什么语言出文案，
  // 无前缀路径落在英文默认上。
  const locale = normalizeLocale(matchPathLocale(pathname));
  const copy = mergeCopy(enCopy, BUNDLES[locale]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-well/90 p-8 shadow-elevation-4 backdrop-blur-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-brand-line bg-brand-soft text-brand mb-4">
          <AlertTriangle className="h-6 w-6" />
        </div>

        <h2 className="text-lg font-bold tracking-tight text-ink">{copy.title}</h2>
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{copy.description}</p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={reloadBypassingCache}
            className="rounded-xl bg-brand px-5 py-2 text-xs font-semibold text-ink-on-accent transition-colors hover:bg-brand-hover active:scale-95"
          >
            {copy.retry}
          </button>
          <Link
            href={localizeStudioPath(locale)}
            className="rounded-xl border border-line bg-wash px-4 py-2 text-xs font-medium text-ink transition-colors hover:bg-wash-press hover:text-ink"
          >
            {copy.backHome}
          </Link>
        </div>
      </div>
    </div>
  );
}
