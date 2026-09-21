'use client';

import React, { useState } from 'react';
import * as NavigationMenu from '@radix-ui/react-navigation-menu';
import { MEGA_NAV_CATEGORIES } from '../../config/mega-navigation';
import MegaMenuPanel from './MegaMenuPanel';
import NavBadge from './NavBadge';

/**
 * 顶栏水平导航与双栏 Mega Menu 组件 (严格遵循 UI_DESIGN_SYSTEM.md 规范)
 * 
 * @param {Object} props
 * @param {string} props.activeTab 当前激活的工作室 Tab ID (如 'image', 'video' 等)
 * @param {string} props.locale 语言代码 ('zh' | 'en')
 * @param {Function} props.onSelectTab 切换 Tab 时的回调
 * @param {string} props.className 外部额外类名
 */
export default function TopMegaNavigation({
  activeTab = 'image',
  locale = 'zh',
  onSelectTab,
  className = '',
}) {
  const isZh = locale?.startsWith('zh') ?? true;
  const [currentOpenValue, setCurrentOpenValue] = useState('');

  // 处理菜单项点击
  const handleItemClick = (e, item) => {
    setCurrentOpenValue('');
    if (item.tabId && onSelectTab) {
      onSelectTab(e, item.tabId, item.modelKey);
    }
  };

  return (
    <NavigationMenu.Root
      value={currentOpenValue}
      onValueChange={setCurrentOpenValue}
      delayDuration={120}
      skipDelayDuration={300}
      className={`relative z-40 flex items-center min-w-0 ${className}`}
    >
      <NavigationMenu.List className="m-0 flex list-none items-center gap-1 overflow-x-auto p-0 scrollbar-rail">
        
        {/* 首页/探索入口 (纯链接) */}
        <NavigationMenu.Item>
          <NavigationMenu.Link
            href="/studio"
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium text-ink-muted transition-colors duration-fast hover:bg-wash hover:text-ink"
          >
            {isZh ? '探索' : 'Explore'}
          </NavigationMenu.Link>
        </NavigationMenu.Item>

        {/* 各主分类 Mega Menu (图像、视频、音频、智能体、社区) */}
        {MEGA_NAV_CATEGORIES.map((cat) => {
          const label = cat.label[isZh ? 'zh' : 'en'] || cat.label.en;
          const isCategoryActive = cat.features?.some((f) => f.tabId === activeTab);

          return (
            <NavigationMenu.Item key={cat.id} value={cat.id}>
              <NavigationMenu.Trigger
                className={`group inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-body-sm font-medium transition-colors duration-fast select-none ${
                  isCategoryActive
                    ? 'bg-wash-strong text-ink font-semibold shadow-elevation-1'
                    : 'text-ink-subtle hover:bg-wash hover:text-ink data-[state=open]:bg-wash-strong data-[state=open]:text-ink'
                }`}
              >
                <span>{label}</span>
                {cat.badge && <NavBadge badge={cat.badge} />}
                <svg
                  className="size-3 text-ink-muted transition-transform duration-fast ease-in-out group-data-[state=open]:rotate-180 group-hover:text-ink"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </NavigationMenu.Trigger>

              <NavigationMenu.Content className="animate-fade-in duration-fast">
                <MegaMenuPanel
                  category={cat}
                  locale={locale}
                  onItemClick={handleItemClick}
                />
              </NavigationMenu.Content>
            </NavigationMenu.Item>
          );
        })}

      </NavigationMenu.List>

      {/* 浮层视口容器 (Radix Viewport) */}
      <div className="absolute left-0 top-full mt-2 flex justify-start">
        <NavigationMenu.Viewport className="relative overflow-hidden rounded-2xl shadow-elevation-3 transition-[width,height] duration-fast ease-standard" />
      </div>
    </NavigationMenu.Root>
  );
}
