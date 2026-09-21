'use client';

import { useState, useEffect, useRef } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { matchPathLocale, resolveClientLocale } from '@/lib/locales';
import { switchLocale as applyLocaleSwitch } from '@/lib/client/localeSwitch';

const LOCALE_OPTIONS = [
  { code: 'en', label: 'English', flag: '/flags/en.svg', flagAlt: 'English' },
  { code: 'zh-CN', label: '简体中文', flag: '/flags/zh-cn.svg', flagAlt: 'Simplified Chinese' },
  { code: 'ja-JP', label: '日本語', flag: '/flags/ja.svg', flagAlt: 'Japanese' },
  { code: 'ko-KR', label: '한국어', flag: '/flags/ko.svg', flagAlt: 'Korean' },
  { code: 'zh-TW', label: '繁體中文', flag: '/flags/zh-tw.svg', flagAlt: 'Traditional Chinese' },
  { code: 'es', label: 'Español', flag: '/flags/es.svg', flagAlt: 'Spanish' },
];

export default function LanguageSwitcher({ className = '', showLabel = true }) {
  const pathname = usePathname() || '/';
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // 首帧只信路径（服务端没有 document.cookie），挂载后再并入 cookie ——
  // 否则无前缀页面上这个标签会永远显示 English。
  const [currentLocale, setCurrentLocale] = useState(() => matchPathLocale(pathname) || 'en');
  useEffect(() => {
    setCurrentLocale(resolveClientLocale({ pathname, search: searchParams?.toString() }));
  }, [pathname, searchParams]);

  const currentOption = LOCALE_OPTIONS.find((option) => option.code === currentLocale) || LOCALE_OPTIONS[0];

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
    applyLocaleSwitch({
      targetLocale,
      pathname,
      search: searchParams?.toString() ? `?${searchParams.toString()}` : '',
    });
  }

  function handleMenuKeyDown(event) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (!open && (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown')) {
      event.preventDefault();
      setOpen(true);
      return;
    }
    if (!open) return;
    const currentIndex = Math.max(0, LOCALE_OPTIONS.findIndex((option) => option.code === currentLocale));
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const nextIndex = event.key === 'ArrowDown'
        ? (currentIndex + 1) % LOCALE_OPTIONS.length
        : (currentIndex - 1 + LOCALE_OPTIONS.length) % LOCALE_OPTIONS.length;
      switchLocale(LOCALE_OPTIONS[nextIndex].code);
    }
  }

  return (
    <div className={`relative inline-block ${className}`} ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        onKeyDown={handleMenuKeyDown}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-ink bg-zinc-900/70 border border-line hover:text-ink hover:border-line-strong transition-all cursor-pointer"
        aria-label={`Switch language. Current language: ${currentOption.label}`}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <line x1="2" y1="12" x2="22" y2="12"/>
          <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
        </svg>
        {showLabel && <span>{currentOption.label}</span>}
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>

      {open && (
        <div role="menu" aria-label="Language options" className="absolute right-0 mt-1.5 w-40 py-1 bg-surface border border-line rounded-lg shadow-elevation-3 z-50 animate-in fade-in zoom-in-95">
          {LOCALE_OPTIONS.map((option) => {
            const selected = option.code === currentLocale;
            return (
              <button
                key={option.code}
                type="button"
                role="menuitem"
                aria-current={selected ? 'true' : undefined}
                onClick={() => switchLocale(option.code)}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2.5 transition-colors ${selected ? 'text-brand bg-brand-pressed font-medium' : 'text-ink hover:text-ink hover:bg-zinc-800/50'}`}
              >
                <img src={option.flag} alt={option.flagAlt} className="h-4 w-5 rounded-xs object-cover ring-1 ring-white/10" />
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
                {selected && <span className="text-brand" aria-hidden="true">✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
