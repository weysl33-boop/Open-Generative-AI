'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter } from 'next/navigation';

export default function LanguageSwitcher({ className = '', showLabel = true }) {
  const pathname = usePathname() || '/';
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // 判断当前语言
  const isZh = pathname === '/zh' || pathname.startsWith('/zh/');
  const currentLocale = isZh ? 'zh' : 'en';

  useEffect(() => {
    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function switchLocale(targetLocale) {
    setOpen(false);
    if (targetLocale === currentLocale) return;

    // 设置 NEXT_LOCALE cookie (1 年有效)
    document.cookie = `NEXT_LOCALE=${targetLocale}; path=/; max-age=31536000; SameSite=Lax`;
    document.cookie = `locale=${targetLocale}; path=/; max-age=31536000; SameSite=Lax`;

    let newPath = pathname;
    if (targetLocale === 'zh') {
      if (!isZh) {
        newPath = pathname === '/' ? '/zh' : `/zh${pathname}`;
      }
    } else {
      if (isZh) {
        newPath = pathname.replace(/^\/zh(?=\/|$)/, '') || '/';
      }
    }

    router.push(newPath);
    router.refresh();
  }

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-zinc-300 bg-zinc-900/70 border border-zinc-800 hover:text-white hover:border-zinc-700 transition-all cursor-pointer"
        aria-label="Switch Language"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10A15.3 15.3 0 0 1 12 22A15.3 15.3 0 0 1 12 2a"/>
        </svg>
        {showLabel && <span>{isZh ? '中文' : 'EN'}</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 mt-1.5 w-32 py-1 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50 animate-in fade-in zoom-in-95">
          <button
            type="button"
            onClick={() => switchLocale('en')}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${!isZh ? 'text-cyan-400 bg-cyan-950/20 font-medium' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'}`}
          >
            <span>English</span>
            {!isZh && <span className="text-cyan-400">✓</span>}
          </button>
          <button
            type="button"
            onClick={() => switchLocale('zh')}
            className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between transition-colors ${isZh ? 'text-cyan-400 bg-cyan-950/20 font-medium' : 'text-zinc-300 hover:text-white hover:bg-zinc-800/50'}`}
          >
            <span>简体中文</span>
            {isZh && <span className="text-cyan-400">✓</span>}
          </button>
        </div>
      )}
    </div>
  );
}