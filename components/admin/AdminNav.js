'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Clapperboard,
  Cpu,
  Megaphone,
  Plug2,
  Wallet,
  Shield,
  ChevronDown,
} from 'lucide-react';
import { hasPermission } from '@/lib/admin/permissions';
import { ADMIN_NAV_GROUPS, matchAdminRoute } from '@/lib/admin/navigation';

const NAV_ICONS = {
  LayoutDashboard,
  Users,
  CreditCard,
  Clapperboard,
  Cpu,
  Megaphone,
  Plug2,
  Wallet,
  Shield,
};

export default function AdminNav({ user, collapsed = false, onItemClick, onRequestExpand, openGroupRequest }) {
  const pathname = usePathname();
  const role = user?.role || 'user';

  const matched = useMemo(() => matchAdminRoute(pathname), [pathname]);

  // 展开状态记录（以稳定 id 为键，菜单改名不影响状态）
  const [openGroups, setOpenGroups] = useState({});

  const toggleGroup = (groupId) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  // 根据当前路径自动展开包含激活项的分类
  useEffect(() => {
    if (matched) {
      setOpenGroups((prev) => (prev[matched.group.id] ? prev : { ...prev, [matched.group.id]: true }));
    }
  }, [matched]);

  // 折叠 rail 点击父级后，由 Shell 请求展开对应分组
  useEffect(() => {
    if (openGroupRequest) {
      const groupId = String(openGroupRequest).split(':')[0];
      setOpenGroups((prev) => ({ ...prev, [groupId]: true }));
    }
  }, [openGroupRequest]);

  const visibleGroups = useMemo(
    () =>
      ADMIN_NAV_GROUPS.map((group) => ({
        ...group,
        items: group.items.filter((item) => hasPermission(role, item.permission)),
      })).filter((group) => group.items.length > 0),
    [role]
  );

  // ── 折叠 rail：仅显示一级图标，悬浮出名称提示 ──
  if (collapsed) {
    return (
      <nav aria-label="管理后台导航" className="flex flex-col items-center gap-1.5">
        {visibleGroups.map((group) => {
          const IconComponent = NAV_ICONS[group.icon] || LayoutDashboard;
          const hasActiveChild = matched?.group.id === group.id;

          if (group.items.length === 1) {
            const item = group.items[0];
            return (
              <Link
                key={group.id}
                href={item.href}
                onClick={onItemClick}
                aria-label={group.label}
                className={`group relative flex size-10 items-center justify-center rounded-lg border transition-colors duration-base active:scale-95 ${
                  hasActiveChild
                    ? 'border-brand-line bg-brand-soft text-brand'
                    : 'border-transparent text-ink-muted hover:bg-wash hover:text-ink'
                }`}
              >
                <IconComponent className="size-4" />
                <NavTooltip label={group.label} />
              </Link>
            );
          }

          return (
            <button
              key={group.id}
              type="button"
              onClick={() => onRequestExpand?.(group.id)}
              aria-label={`${group.label}（点击展开菜单）`}
              className={`group relative flex size-10 items-center justify-center rounded-lg border transition-colors duration-base active:scale-95 ${
                hasActiveChild
                  ? 'border-brand-line bg-brand-soft text-brand'
                  : 'border-transparent text-ink-muted hover:bg-wash hover:text-ink'
              }`}
            >
              <IconComponent className="size-4" />
              {hasActiveChild && (
                <span className="absolute right-0.5 top-1.5 size-1.5 rounded-full bg-brand" />
              )}
              <NavTooltip label={group.label} />
            </button>
          );
        })}
      </nav>
    );
  }

  return (
    <nav aria-label="管理后台导航" className="space-y-1">
      {visibleGroups.map((group) => {
        const IconComponent = NAV_ICONS[group.icon] || LayoutDashboard;
        const hasActiveChild = matched?.group.id === group.id;
        const isOpen = !!openGroups[group.id];

        // 仅单个菜单项的分组（如“工作台”）直接渲染为顶级直通路由链接
        if (group.items.length === 1) {
          const item = group.items[0];
          const active = matched?.item.id === item.id;
          return (
            <Link
              key={group.id}
              href={item.href}
              onClick={onItemClick}
              className={`group relative flex h-10 items-center gap-2.5 rounded-lg border px-3 text-body-sm font-medium tracking-wide transition-colors duration-base active:scale-95 ${
                active
                  ? 'border-brand-line bg-brand-soft font-semibold text-brand'
                  : 'border-transparent text-ink-muted hover:border-line-subtle hover:bg-wash hover:text-ink'
              }`}
            >
              {active && (
                <span className="absolute left-0 top-2.5 bottom-2.5 w-1 rounded-r-full bg-brand" />
              )}
              <IconComponent
                className={`size-4 shrink-0 transition-colors ${
                  active ? 'text-brand' : 'text-ink-muted group-hover:text-ink'
                }`}
              />
              <span className="truncate">{group.label}</span>
            </Link>
          );
        }

        // 父级无独立页面：点击整行仅做展开/折叠，不做跳转
        return (
          <div key={group.id}>
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={isOpen}
              className={`group flex h-10 w-full items-center justify-between rounded-lg px-3 text-body-sm tracking-wide transition-colors duration-base active:scale-95 ${
                hasActiveChild
                  ? 'font-semibold text-ink'
                  : 'font-medium text-ink-muted hover:bg-wash hover:text-ink'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <IconComponent
                  className={`size-4 shrink-0 transition-colors ${
                    hasActiveChild ? 'text-brand' : 'text-ink-muted group-hover:text-ink'
                  }`}
                />
                <span className="truncate">{group.label}</span>
              </div>

              <div className="flex items-center gap-1.5">
                {hasActiveChild && !isOpen && (
                  <span className="size-1.5 rounded-full bg-brand" />
                )}
                <ChevronDown
                  className={`size-3.5 transition-transform duration-base ease-standard ${
                    hasActiveChild ? 'text-brand' : 'text-ink-muted group-hover:text-ink'
                  } ${isOpen ? 'rotate-180' : ''}`}
                />
              </div>
            </button>

            {/* 下滑展开的二级子菜单 (CSS Grid 丝滑高度自适应过渡) */}
            <div
              className={`grid transition-[grid-template-rows,opacity] duration-base ease-standard ${
                isOpen ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0 pointer-events-none'
              }`}
            >
              <div className="overflow-hidden">
                <div className="relative mt-1 ml-5 space-y-0.5 border-l border-line-subtle pb-1 pl-3.5">
                  {group.items.map((item) => {
                    const active = matched?.item.id === item.id;

                    return (
                      <Link
                        key={item.id}
                        href={item.href}
                        onClick={onItemClick}
                        aria-current={active ? 'page' : undefined}
                        className={`group relative flex h-9 items-center rounded-lg border px-2.5 text-body-sm tracking-wide transition-colors duration-base active:scale-95 ${
                          active
                            ? 'border-brand-line bg-brand-soft font-semibold text-brand'
                            : 'border-transparent font-normal text-ink-muted hover:border-line-subtle hover:bg-wash hover:text-ink'
                        }`}
                      >
                        <span
                          className={`mr-2.5 size-1 shrink-0 rounded-full transition-colors duration-base ${
                            active ? 'bg-brand' : 'bg-line-strong group-hover:bg-wash-press'
                          }`}
                        />
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function NavTooltip({ label }) {
  return (
    <span
      role="tooltip"
      className="pointer-events-none absolute left-full top-1/2 z-popover hidden -translate-y-1/2 whitespace-nowrap rounded-md border border-line-subtle bg-surface px-2.5 py-1.5 text-caption font-medium text-ink shadow-elevation-2 group-hover:block"
    >
      {label}
    </span>
  );
}
