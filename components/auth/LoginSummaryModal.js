'use client';

import React, { useState } from 'react';
import { X, Activity, BarChart3, ArrowRight } from 'lucide-react';
import ActivityTab from '@/components/account/tabs/ActivityTab';
import UsageTab from '@/components/account/tabs/UsageTab';

export default function LoginSummaryModal({ user, onClose, onGoStudio }) {
  const [currentTab, setCurrentTab] = useState('activity'); // 'activity' | 'usage'

  const handleClose = () => {
    onClose?.();
  };

  const handleContinue = () => {
    if (onGoStudio) {
      onGoStudio();
    } else {
      handleClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal flex items-center justify-center bg-scrim backdrop-blur-xl p-3 sm:p-6 overflow-hidden animate-fade-in"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
    >
      <div className="relative flex flex-col w-full max-w-[1080px] h-[90vh] max-h-[820px] rounded-3xl border border-line bg-surface/98 shadow-[0_25px_90px_rgba(0,0,0,0.9)] overflow-hidden backdrop-blur-2xl">
        {/* 顶部标题与控制栏 */}
        <div className="flex items-center justify-between border-b border-line px-6 py-4 shrink-0 bg-well/80">
          <div className="flex items-center gap-3">
            <div className="size-9 rounded-xl bg-brand-soft border border-brand-line flex items-center justify-center text-brand-hover">
              <Activity className="size-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <span>用户活跃与用量总览</span>
                <span className="text-micro uppercase font-mono px-1.5 py-0.5 rounded bg-wash-press text-ink">
                  {user?.id ? `#${user.id}` : 'ONLINE'}
                </span>
              </h2>
              <p className="text-xs text-ink-muted">快捷登录已完成，实时同步您的创作热力与模型使用明细</p>
            </div>
          </div>

          {/* 选项卡胶囊切换：[ 创作活跃与偏好 ]  [ 当前使用量明细 ] */}
          <div className="flex items-center gap-3">
            <div className="hidden sm:inline-flex rounded-full bg-canvas p-1 border border-line">
              <button
                type="button"
                onClick={() => setCurrentTab('activity')}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  currentTab === 'activity'
                    ? 'bg-brand-soft text-brand border border-brand-line'
                    : 'text-ink-muted hover:text-ink border border-transparent'
                }`}
              >
                <Activity className="size-3.5" />
                <span>创作活跃与偏好</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentTab('usage')}
                className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors ${
                  currentTab === 'usage'
                    ? 'bg-brand-soft text-brand border border-brand-line'
                    : 'text-ink-muted hover:text-ink border border-transparent'
                }`}
              >
                <BarChart3 className="size-3.5" />
                <span>当前使用量明细</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handleClose}
              aria-label="关闭总览面板"
              className="flex size-9 items-center justify-center rounded-xl bg-wash text-ink-muted hover:bg-wash-press hover:text-ink transition-colors"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        {/* 移动端胶囊切换栏 */}
        <div className="sm:hidden flex items-center justify-center border-b border-line-subtle bg-base p-2 shrink-0">
          <div className="inline-flex rounded-full bg-canvas p-1 border border-line w-full max-w-[320px]">
            <button
              type="button"
              onClick={() => setCurrentTab('activity')}
              className={`flex-1 flex items-center justify-center gap-1 rounded-full py-1 text-xs font-semibold transition-colors ${
                currentTab === 'activity'
                  ? 'bg-brand-pressed text-brand-hover border border-brand-line'
                  : 'text-ink-muted'
              }`}
            >
              <Activity className="size-3" />
              <span>创作活跃</span>
            </button>
            <button
              type="button"
              onClick={() => setCurrentTab('usage')}
              className={`flex-1 flex items-center justify-center gap-1 rounded-full py-1 text-xs font-semibold transition-colors ${
                currentTab === 'usage'
                  ? 'bg-brand-pressed text-brand-hover border border-brand-line'
                  : 'text-ink-muted'
              }`}
            >
              <BarChart3 className="size-3" />
              <span>使用量明细</span>
            </button>
          </div>
        </div>

        {/* 内容主体区：完全照搬个人中心已有成熟组件 */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-8 custom-scrollbar">
          {currentTab === 'activity' ? (
            <ActivityTab user={user} />
          ) : (
            <UsageTab />
          )}
        </div>

        {/* 底部快捷操作条 */}
        <div className="flex items-center justify-between border-t border-line px-6 py-3.5 bg-well/80 shrink-0">
          <span className="text-xs text-ink-muted hidden sm:inline">
            数据已实时与云端同步，随时可在右上角「个人中心」查看
          </span>
          <button
            type="button"
            onClick={handleContinue}
            className="w-full sm:w-auto ml-auto inline-flex items-center justify-center gap-2 rounded-xl bg-brand hover:bg-brand-hover text-ink-on-accent px-6 py-2.5 text-xs font-bold shadow-elevation-2 transition  active:scale-[0.98]"
          >
            <span>开启创作之旅</span>
            <ArrowRight className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
