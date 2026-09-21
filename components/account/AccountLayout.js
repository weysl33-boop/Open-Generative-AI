'use client';

import React, { useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { X, LogOut, User } from 'lucide-react';
import { avatarFrameClasses } from '@/lib/benefits/catalog';

export const NAV_ITEMS = [
  { id: 'activity', label: '创作活跃与偏好', group: 1 },
  { id: 'edit-profile', label: '编辑资料', group: 1 },
  { id: 'settings', label: '设置', group: 1 },
  { id: 'membership', label: '会员订阅', group: 2, badge: 'PRO' },
  { id: 'points-details', label: '积分详情', group: 2 },
  { id: 'feedback', label: '建议与漏洞提交', group: 2 },
  { id: 'usage', label: '使用明细', group: 2 },
  { id: 'order-invoices', label: '订单发票', group: 2 },
  { id: 'price-details', label: '价格详情', group: 2 },
  { id: 'agent-api-key', label: 'Agent API 密钥', group: 2 },
  { id: 'terms', label: '使用条款', group: 3, href: '/terms' },
  { id: 'privacy', label: '隐私政策', group: 3, href: '/privacy' },
];


export default function AccountLayout({
  user,
  activeTab = 'price-details',
  onTabChange,
  onLogout,
  onClose,
  children,
}) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);
  const userEmail = user?.email || user?.phone || '创作者';
  const userName = user?.displayName || user?.display_name || user?.name || (userEmail.includes('@') ? userEmail.split('@')[0] : userEmail);

  // 关闭悬浮窗：清理 URL 参数并优先调用传入的 onClose 回调
  const handleClose = useCallback(() => {
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('account') || url.searchParams.has('action')) {
          url.searchParams.delete('account');
          url.searchParams.delete('action');
          window.history.replaceState(null, '', url.toString());
        }
      } catch {}
    }
    if (onClose) {
      onClose();
      return;
    }
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
    } else {
      router.push('/studio');
    }
  }, [onClose, router]);

  // 监听 ESC 键关闭悬浮窗
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [handleClose]);

  const handleLogoutClick = async () => {
    setLoggingOut(true);
    if (onLogout) {
      await onLogout();
    }
  };

  const renderNavItem = (item) => {
    const isActive = activeTab === item.id;

    if (item.href) {
      return (
        <a
          key={item.id}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full flex items-center px-3 py-2 rounded-xl text-[13px] font-medium text-ink-muted hover:text-ink hover:bg-wash transition-all"
        >
          <span className="tracking-wide">{item.label}</span>
        </a>
      );
    }

    return (
      <button
        key={item.id}
        type="button"
        onClick={() => onTabChange(item.id)}
        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-[13px] transition-all text-start cursor-pointer ${
          isActive
            ? 'bg-wash-strong text-ink font-bold shadow-elevation-1'
            : 'text-ink-muted font-medium hover:text-ink hover:bg-wash'
        }`}
      >
        <span className="tracking-wide">{item.label}</span>
        {item.badge && (
          <span className="rounded-full bg-gradient-to-r from-warning-soft to-orange-400/20 border border-warning-line px-1.5 py-0.2 text-micro font-black text-warning">
            {item.badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 lg:p-8 bg-scrim backdrop-blur-md animate-in fade-in duration-base overflow-hidden cursor-pointer"
      onClick={(e) => {
        if (e.target === e.currentTarget) handleClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-label="管理账户悬浮窗"
    >
      {/* 悬浮窗口卡片主体 */}
      <div 
        className="relative w-full max-w-[1180px] h-[88vh] max-h-[820px] min-h-[580px] rounded-2xl border border-line bg-surface/95 backdrop-blur-xl shadow-[0_25px_80px_rgba(0,0,0,0.9)] flex flex-col md:flex-row overflow-hidden animate-in zoom-in-95 duration-fast cursor-default"
        onClick={(e) => e.stopPropagation()}
      >
        
        {/* 悬浮窗右上角极简关闭按钮 */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 z-50 p-2.5 rounded-full text-ink-muted hover:text-ink hover:bg-wash-press active:scale-95 transition-all cursor-pointer"
          title="关闭 (Esc)"
          aria-label="关闭悬浮窗"
        >
          <X className="size-4.5" />
        </button>

        {/* 左侧侧边栏 (Sidebar) */}
        <aside className="w-full md:w-[220px] shrink-0 border-b md:border-b-0 md:border-r border-line-subtle bg-well/90 p-5 lg:p-6 flex flex-col justify-between select-none overflow-y-auto custom-scrollbar">
          <div>
            {/* 顶栏大标题 */}
            <h2 className="text-[19px] font-bold text-ink tracking-tight">管理账户</h2>

            {/* 分割线 1 */}
            <div className="h-[1px] bg-wash-strong mt-5 mb-5" />

            {/* 用户头像与信息 */}
            <div className="flex items-center gap-3 mb-5 px-1">
              <div className={`w-[42px] h-[42px] rounded-full overflow-hidden bg-overlay flex items-center justify-center shrink-0 ${avatarFrameClasses(user?.avatarFrame || user?.avatar_frame) || 'border border-line'}`}>
                {user?.photo_url || user?.avatar || user?.avatar_url ? (
                  <img
                    src={user.photo_url || user.avatar || user.avatar_url}
                    alt={userName}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-5 h-5 text-ink-muted" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-[13px] text-ink font-semibold truncate">{userName}</p>
                </div>
                <p className="text-[11px] text-ink-muted font-mono truncate">
                  UID: {user?.id || ''}
                </p>
              </div>
            </div>

            {/* 分组 1: 编辑资料 / 设置 */}
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.filter((item) => item.group === 1).map(renderNavItem)}
            </div>

            {/* 分割线 2 */}
            <div className="h-[1px] bg-wash-strong my-4" />

            {/* 分组 2: 积分 / 发票 / 价格 / API 密钥 */}
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.filter((item) => item.group === 2).map(renderNavItem)}
            </div>

            {/* 分割线 3 */}
            <div className="h-[1px] bg-wash-strong my-4" />

            {/* 分组 3: 条款 / 隐私 */}
            <div className="flex flex-col gap-1">
              {NAV_ITEMS.filter((item) => item.group === 3).map(renderNavItem)}
            </div>
          </div>

          {/* 底部退出登录 */}
          <div className="pt-4 mt-auto border-t border-line-subtle">
            <button
              type="button"
              disabled={loggingOut}
              onClick={handleLogoutClick}
              className="w-full flex items-center px-3 py-2 rounded-xl text-[13px] font-medium text-ink-muted hover:text-danger hover:bg-danger-soft transition-colors text-start cursor-pointer disabled:opacity-50"
            >
              <LogOut className={`w-4 h-4 me-2.5 shrink-0 ${loggingOut ? 'animate-spin' : ''}`} />
              <span className="tracking-wide">{loggingOut ? '正在退出并返回首页…' : '退出登录'}</span>
            </button>
          </div>
        </aside>

        {/* 右侧主内容卡片 (独立纵向平滑滚动) */}
        <main className="flex-1 h-full min-w-0 overflow-y-auto custom-scrollbar p-6 lg:p-10 bg-surface">
          <div className="max-w-4xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
