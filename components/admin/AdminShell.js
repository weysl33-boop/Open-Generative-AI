'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, PanelLeftClose, PanelLeftOpen, LogOut } from 'lucide-react';
import AdminNav from './AdminNav';
import AdminBreadcrumbs from './AdminBreadcrumbs';
import { roleLabel } from '@/lib/admin/permissions';
import { Badge } from '@/components/ui/badge';
import { BrandMark } from '@/components/site/StudioHeader';

const COLLAPSE_STORAGE_KEY = 'ko_admin_nav_collapsed';

function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(value) {
  try {
    window.localStorage.setItem(COLLAPSE_STORAGE_KEY, value ? '1' : '0');
  } catch {}
}

export default function AdminShell({ user, children }) {
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [openGroupRequest, setOpenGroupRequest] = useState(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      writeCollapsed(next);
      return next;
    });
  };

  // 折叠 rail 点击父级分组：恢复展开并定位到该分组
  const expandForGroup = (groupId) => {
    setCollapsed(false);
    writeCollapsed(false);
    setOpenGroupRequest(`${groupId}:${Date.now()}`);
  };

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-canvas text-ink">
      {/* 顶栏（--header-h 固定） */}
      <header className="fixed inset-x-0 top-0 z-sticky flex h-header-h items-center justify-between border-b border-line-subtle bg-surface-glass px-4 backdrop-blur-md shadow-elevation-1">
        <div className="flex items-center gap-3">
          {/* 移动端汉堡按钮 */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="flex size-8 items-center justify-center rounded-md border border-line-subtle bg-wash text-ink hover:bg-wash-strong focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring lg:hidden"
            aria-label="切换侧栏导航"
          >
            {mobileNavOpen ? <X className="size-4" /> : <Menu className="size-4" />}
          </button>

          <BrandMark compact />

          <span className="rounded-full border border-line-subtle bg-wash px-2.5 py-0.5 text-caption font-semibold uppercase tracking-wider text-ink-muted">
            运营管理端
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-label">
          <span className="hidden items-center gap-1.5 rounded-full border border-success-line bg-success-soft px-2.5 py-0.5 text-success sm:flex">
            <span className="size-1.5 rounded-full bg-success" />
            系统在线
          </span>

          <Badge variant="accent" className="font-medium">
            {roleLabel(user?.role)}
          </Badge>

          <span className="hidden rounded-md border border-line-subtle bg-wash px-2.5 py-1 font-mono text-caption text-ink-muted md:inline">
            {user?.email}
          </span>
        </div>
      </header>

      {/* 桌面端侧栏：Header 固定 / Navigation 滚动 / 用户区固定 */}
      <aside
        className={`fixed bottom-0 left-0 top-header-h z-30 hidden flex-col border-r border-line-subtle bg-surface transition-[width] duration-base ease-standard lg:flex ${
          collapsed ? 'w-sidebar-collapsed' : 'w-sidebar'
        }`}
      >
        <div
          className={`flex h-10 shrink-0 items-center border-b border-line-subtle px-3 ${
            collapsed ? 'justify-center' : 'justify-between'
          }`}
        >
          {!collapsed && (
            <span className="text-micro font-semibold uppercase tracking-widest text-ink-muted">
              导航
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? '展开侧栏' : '折叠侧栏'}
            className="flex size-7 items-center justify-center rounded-md border border-transparent text-ink-muted transition-colors duration-fast hover:border-line-subtle hover:bg-wash hover:text-ink"
          >
            {collapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        <div
          className={`admin-sidebar-scrollbar scrollbar-rail min-h-0 flex-1 overflow-y-auto py-3 ${
            collapsed ? 'px-1.5' : 'px-2.5'
          }`}
        >
          <AdminNav
            user={user}
            collapsed={collapsed}
            onRequestExpand={expandForGroup}
            openGroupRequest={openGroupRequest}
          />
        </div>

        <div className={`shrink-0 border-t border-line-subtle p-2.5 ${collapsed ? 'flex justify-center' : ''}`}>
          {collapsed ? (
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              aria-label="退出登录"
              className="flex size-10 items-center justify-center rounded-md border border-transparent text-ink-muted transition-colors duration-fast hover:border-danger-line hover:bg-danger-soft hover:text-danger"
            >
              <LogOut className={`size-4 ${loggingOut ? 'animate-spin' : ''}`} />
            </button>
          ) : (
            <div className="rounded-lg border border-line-subtle bg-well p-2.5">
              <p className="truncate text-micro font-medium text-ink" title={user?.email}>
                {user?.email || '未登录'}
              </p>
              <p className="mt-0.5 text-micro text-ink-subtle">{roleLabel(user?.role)}</p>
              <div className="mt-2 flex items-center gap-1.5">
                <Link
                  href="/studio"
                  className="flex h-control-xs flex-1 items-center justify-center rounded-sm border border-line-subtle bg-wash text-micro font-medium text-ink-muted transition-colors duration-fast hover:border-brand-line hover:bg-brand-soft hover:text-brand"
                >
                  返回 Studio
                </Link>
                <Link
                  href="/account"
                  className="flex h-control-xs flex-1 items-center justify-center rounded-sm border border-line-subtle bg-wash text-micro font-medium text-ink-muted transition-colors duration-fast hover:border-brand-line hover:bg-brand-soft hover:text-brand"
                >
                  账户
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  disabled={loggingOut}
                  aria-label="退出登录"
                  className="flex size-7 items-center justify-center rounded-sm border border-line-subtle bg-wash text-ink-muted transition-colors duration-fast hover:border-danger-line hover:bg-danger-soft hover:text-danger"
                >
                  <LogOut className={`size-3.5 ${loggingOut ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* 移动端侧栏抽屉 */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-modal lg:hidden">
          <div
            className="fixed inset-0 bg-scrim backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="admin-sidebar-scrollbar scrollbar-rail fixed bottom-0 left-0 top-header-h w-sidebar overflow-y-auto border-r border-line-subtle bg-surface px-2.5 py-4 shadow-elevation-4">
            <AdminNav user={user} onItemClick={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* 主画布区域 */}
      <main
        className={`min-h-screen pt-header-h transition-[padding] duration-base ease-standard ${
          collapsed ? 'lg:pl-sidebar-collapsed' : 'lg:pl-sidebar-w'
        }`}
      >
        <div className="mx-auto max-w-screen-xl px-4 py-6 sm:px-6 lg:px-8">
          {pathname !== '/admin' && <AdminBreadcrumbs pathname={pathname} />}
          {children}
        </div>
      </main>
    </div>
  );
}
