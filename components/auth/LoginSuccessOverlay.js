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
      className="fixed inset-0 z-[250] flex items-center justify-center bg-black/80 backdrop-blur-md animate-fade-in p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative w-full max-w-[380px] rounded-3xl border border-cyan-500/30 bg-[#12141c]/95 p-7 text-center shadow-[0_20px_70px_rgba(6,182,212,0.25)] backdrop-blur-2xl overflow-hidden animate-in zoom-in-95 duration-200">
        {/* 背景微光光晕 */}
        <div className="absolute -top-24 -left-24 size-48 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 size-48 rounded-full bg-blue-500/20 blur-3xl pointer-events-none" />

        {/* 顶部动态勾选与微光动画 */}
        <div className="relative mx-auto mb-4 flex size-20 items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-cyan-400/40 border-t-cyan-300 animate-spin duration-1000" />
          <div className="size-16 rounded-full bg-gradient-to-tr from-cyan-500/30 to-blue-500/20 flex items-center justify-center shadow-[0_0_25px_rgba(6,182,212,0.4)]">
            <CheckCircle2 className="size-9 text-cyan-300 animate-in zoom-in-75 duration-300" />
          </div>
        </div>

        {/* 标题与欢迎文案 */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/25 text-[11px] font-semibold text-cyan-300 mb-2.5">
          <Sparkles className="size-3 text-cyan-400" />
          <span>{providerLabel} 登录成功</span>
        </div>

        <h3 className="text-xl font-bold tracking-tight text-white mb-1.5">
          欢迎回来，{name}
        </h3>
        <p className="text-xs text-gray-400 leading-relaxed mb-6">
          已成功同步您的算力额度与专属创作历史，正在载入您的创作看板…
        </p>

        {/* 进度微动画条 */}
        <div className="w-full bg-white/10 h-1 rounded-full overflow-hidden mb-4">
          <div
            className="h-full bg-gradient-to-r from-cyan-400 to-blue-400 rounded-full animate-[progress_1.5s_ease-out_forwards]"
            style={{ animationDuration: `${duration}ms` }}
          />
        </div>

        <button
          type="button"
          onClick={() => onComplete?.()}
          className="inline-flex items-center justify-center gap-1.5 text-xs text-cyan-300 hover:text-cyan-200 transition-colors font-medium cursor-pointer"
        >
          <span>立即前往创作看板</span>
          <ArrowRight className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
