'use client';

import { useEffect } from 'react';

/**
 * 根页面级智能自愈错误边界 (Page-Level Error Boundary)
 * 在保持全站布局完好的情况下捕获页面组件运行时异常，杜绝整站黑屏弹窗
 */
export default function ErrorBoundary({ error, reset }) {
  useEffect(() => {
    console.error('[Page Error Caught]:', error);

    // 自动自愈尝试：针对未捕获的瞬态运行时异常，在10秒防抖内平滑自愈1次
    if (typeof window !== 'undefined') {
      const lastAttempt = sessionStorage.getItem('koyosim_page_error_retry');
      const now = Date.now();
      if (!lastAttempt || now - Number(lastAttempt) > 10000) {
        sessionStorage.setItem('koyosim_page_error_retry', String(now));
        try {
          reset();
        } catch {
          window.location.reload();
        }
      }
    }
  }, [error, reset]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-6 text-center text-ink">
      <div className="w-full max-w-md rounded-2xl border border-line bg-well/90 p-8 shadow-elevation-4 backdrop-blur-md">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-brand-line bg-brand-soft text-brand mb-4">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h2 className="text-lg font-bold tracking-tight text-ink">
          页面遇到临时运行波动
        </h2>
        <p className="mt-2 text-xs text-ink-muted leading-relaxed">
          正在为您快速自愈并保持会话。若未自动恢复，请点击下方按钮重新加载。
        </p>

        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.location.reload();
              } else {
                reset();
              }
            }}
            className="rounded-xl bg-brand px-5 py-2 text-xs font-semibold text-ink-on-accent hover:bg-brand transition-colors shadow-elevation-1 active:scale-95"
          >
            重新加载页面
          </button>
          <a
            href="/studio"
            className="rounded-xl border border-line bg-wash px-4 py-2 text-xs font-medium text-ink hover:bg-wash-press hover:text-ink transition-colors"
          >
            返回工作室
          </a>
        </div>
      </div>
    </div>
  );
}
