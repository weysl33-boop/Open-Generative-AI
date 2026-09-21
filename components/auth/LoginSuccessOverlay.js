'use client';

import React, { useEffect } from 'react';
import { CheckCircle2, Sparkles, ArrowRight } from 'lucide-react';

export default function LoginSuccessOverlay({ user, provider = null, onComplete, duration = 1500 }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete?.();
    }, duration);
    return () => clearTimeout(timer);
  }, [onComplete, duration]);

  const providerNames = {
    google: 'Google 账号',
    x: 'X (Twitter)',
    tiktok: 'TikTok',
    phone: '手机快捷',
    email: '安全邮箱',
  };

  const providerLabel = providerNames[String(provider || '').toLowerCase()] || '快捷授权';
  const name = user?.displayName || user?.display_name || user?.name || '创作者';

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-scrim backdrop-blur-md animate-fade-in p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-[380px] rounded-2xl border border-line bg-overlay-glass p-7 text-center shadow-elevation-3 backdrop-blur-2xl overflow-hidden animate-in zoom-in-95 duration-base">

        {/* 顶部动态勾选：进度环用 brand，落地为 elevation，不做彩色发光 */}
        <div className="relative mx-auto mb-4 flex size-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-line border-t-brand animate-spin duration-1000" />
          <div className="size-16 rounded-full bg-brand-soft border border-brand-line flex items-center justify-center shadow-elevation-2">
            <CheckCircle2 className="size-9 text-brand animate-in zoom-in-75 duration-page" />
          </div>
        </div>

        {/* 标题与欢迎文案 */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-soft border border-brand-line text-caption font-semibold text-brand mb-2.5">
          <Sparkles className="size-3 text-brand" />
          <span>{providerLabel} 登录成功</span>
        </div>

        <h3 className="text-xl font-bold tracking-tight text-ink mb-1.5">
          欢迎回来，{name}
        </h3>
        <p className="text-xs text-ink-muted leading-relaxed mb-6">
          已成功同步您的算力额度与专属创作历史，正在载入您的创作看板…
        </p>

        {/* 进度微动画条 */}
        <div className="w-full bg-wash-press h-1 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-brand to-info rounded-full animate-[progress_1.5s_ease-out_forwards]"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>

        <button
          type="button"
          onClick={() => onComplete?.()}
          className="inline-flex items-center justify-center gap-1.5 text-xs text-brand-hover hover:text-brand-hover transition-colors font-medium cursor-pointer"
        >
          <span>立即前往创作看板</span>
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
