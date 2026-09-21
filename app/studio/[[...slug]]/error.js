'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { localizedHref } from '@/lib/client/localeSwitch';

export default function StudioErrorBoundary({ error, reset }) {
  const pathname = usePathname();
  useEffect(() => {
    console.error('[Studio Error Caught]:', error);
  }, [error]);

  // 与根 error.js 不同：此处不自动 reset，避免工作台在确定性错误下无限重载
  return (
    <div className="flex flex-col items-center justify-center px-6 py-24 text-center text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-well p-8 shadow-elevation-4">
        <h2 className="text-body font-semibold tracking-tight text-ink">工作台遇到瞬态异常</h2>
        <p className="mt-2 text-body-sm leading-relaxed text-ink-muted">
          Studio 页面本次加载失败。您的账户、积分与已生成的作品均未受影响，可重试当前页面。
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => reset()}
            className="rounded-xl bg-brand px-5 py-2 text-label font-semibold text-ink-on-accent shadow-elevation-1 transition-colors active:scale-95"
          >
            重试
          </button>
          <a
            href={localizedHref('/studio', { pathname })}
            className="rounded-xl border border-line bg-wash px-4 py-2 text-label font-medium text-ink transition-colors hover:bg-wash-press"
          >
            返回工作台
          </a>
        </div>
      </div>
    </div>
  );
}
