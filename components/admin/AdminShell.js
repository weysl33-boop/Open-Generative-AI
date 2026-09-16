'use client';

import { useState } from 'react';
import Link from 'next/link';
import AdminNav from './AdminNav';
import { roleLabel } from '@/lib/admin/permissions';

export default function AdminShell({ user, children }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* 56px 顶栏 */}
      <header className="fixed inset-x-0 top-0 z-40 flex h-14 items-center justify-between border-b border-white/[0.06] bg-[#0a0a0b]/90 px-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          {/* 移动端汉堡按钮 */}
          <button
            type="button"
            onClick={() => setMobileNavOpen(!mobileNavOpen)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 hover:bg-white/10 lg:hidden"
            aria-label="切换侧栏导航"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              {mobileNavOpen ? (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>

          <Link href="/studio" className="flex items-center gap-2.5" aria-label="返回 Studio">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#22d3ee] text-sm font-black text-black shadow-lg shadow-[#22d3ee]/20">
              K
            </span>
            <span className="hidden text-sm font-bold tracking-tight sm:inline">KoyoSIM AI Studio</span>
          </Link>

          <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1 text-xs text-white/60">
            运营管理端
          </span>
        </div>

        <div className="flex items-center gap-2.5 text-xs">
          <span className="hidden items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/10 px-3 py-1 text-emerald-200 sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-300 shadow-[0_0_6px_#6ee7b7]" />
            系统在线
          </span>

          <span className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-2.5 py-1 text-cyan-200 font-medium">
            {roleLabel(user?.role)}
          </span>

          <span className="hidden rounded-md border border-white/10 bg-white/5 px-3 py-1 text-white/70 md:inline">
            {user?.email}
          </span>

          <Link
            href="/account"
            className="rounded-md border border-white/10 bg-white/5 px-3 py-1 text-white/75 transition hover:border-cyan-300/40 hover:bg-cyan-300/10 hover:text-cyan-100"
          >
            账户
          </Link>
        </div>
      </header>

      {/* 桌面端 216px 展开侧栏 */}
      <aside className="fixed bottom-0 left-0 top-14 hidden w-[216px] overflow-y-auto border-r border-white/[0.06] bg-[#0a0a0a] px-3 py-5 custom-scrollbar lg:block">
        <AdminNav user={user} />
      </aside>

      {/* 移动端侧栏抽屉 */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          <aside className="fixed bottom-0 left-0 top-14 w-[240px] overflow-y-auto border-r border-white/10 bg-[#0a0a0a] px-4 py-6 shadow-2xl">
            <AdminNav user={user} onItemClick={() => setMobileNavOpen(false)} />
          </aside>
        </div>
      )}

      {/* 主画布区域 */}
      <main className="min-h-screen pt-14 lg:pl-[216px]">
        <div className="mx-auto max-w-[1280px] px-4 py-8 sm:px-6 lg:px-8">
          {children}
        </div>
      </main>
    </div>
  );
}
