'use client';

import { useEffect } from 'react';
import { reloadBypassingCache, trySpendReload } from '@/lib/client/reloadBudget';

export default function GlobalError({ error, reset }) {
  useEffect(() => {
    console.error('[GlobalError caught]', error);

    const msg = String(error?.message || error?.digest || error || '');

    // 全面检测是否为版本更新、静态 Chunk 缺失、RSC 失步或组件渲染缺失等暂时性错误
    const isChunkOrSyncIssue =
      msg.includes('ChunkLoadError') ||
      msg.includes('Loading chunk') ||
      msg.includes('CSS_CHUNK_LOAD_FAILED') ||
      msg.includes('Failed to fetch RSC payload') ||
      msg.includes('NEXT_RSC_ERR') ||
      msg.includes('Unexpected token') ||
      msg.includes('Element type is invalid') ||
      msg.includes('Minified React error') ||
      msg.includes('Failed to fetch');

    // 预算与 ChunkSelfHealing 共用：两条路径各记各的 10s/15s 冷却时，
    // 一次版本发布会把它们轮流点燃成刷新循环。
    if (isChunkOrSyncIssue && typeof window !== 'undefined' && trySpendReload()) {
      reloadBypassingCache();
    }
  }, [error]);

  const handleHardRefresh = () => {
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.clear();
      } catch {}
      // 通过追加随机时间戳强刷，绕过浏览器客户端可能残留的协商缓存
      reloadBypassingCache();
    } else {
      reset();
    }
  };

  return (
    <html lang="zh-CN">
      <body className="flex min-h-screen items-center justify-center bg-canvas p-6 text-ink font-sans antialiased selection:bg-brand selection:text-ink-on-accent">
        <div className="w-full max-w-lg rounded-2xl border border-line bg-wash p-8 text-center shadow-elevation-4 shadow-black/80 backdrop-blur-md">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-line bg-brand-soft text-brand-hover shadow-elevation-2 shadow-brand-soft">
            <svg className="h-7 w-7 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </div>

          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.24em] text-brand-hover">
            KoyoSIM AI Studio
          </p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-ink">
            页面运行遇到异常
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            系统检测到组件加载波动或会话中断。您可以尝试刷新页面恢复运行，或返回工作台首页。
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={handleHardRefresh}
              className="inline-flex items-center gap-2 rounded-xl bg-brand px-6 py-2.5 text-xs font-bold text-ink-on-accent transition hover:bg-brand active:scale-95 shadow-elevation-2 shadow-brand-soft"
            >
              <span>清除缓存并同步</span>
              <span>↻</span>
            </button>
            <a
              href="/"
              className="rounded-xl border border-line-strong bg-wash px-5 py-2.5 text-xs font-medium text-ink-muted transition hover:border-line-strong hover:bg-wash-press hover:text-ink"
            >
              返回首页
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
