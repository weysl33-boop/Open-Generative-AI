'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ArrowLeft,
  Flame,
  FolderOpen,
  Settings,
  Zap,
  Sparkles,
  Wand2,
  Box,
  Bot,
  Compass,
  ExternalLink,
  Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import AuthModal from '@/components/AuthModal';
import UserDropdownMenu from '@/components/UserDropdownMenu';
import AccountModal from '@/components/account/AccountModal';
import { useBranding } from '@/lib/hooks/useBranding';
import { resolveClientLocale } from '@/lib/locales';

function DynamicVectorIcon({ iconName, color = 'currentColor', className = 'size-5' }) {
  switch (iconName) {
    case 'sparkles':
      return <Sparkles className={className} style={{ color }} />;
    case 'wand':
      return <Wand2 className={className} style={{ color }} />;
    case 'zap':
      return <Zap className={className} style={{ color }} />;
    case 'cube':
      return <Box className={className} style={{ color }} />;
    case 'layers':
    default:
      return (
        <svg
          className={className}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
      );
  }
}

function DynamicNavIcon({ iconName, color, className = 'size-3.5' }) {
  switch (iconName) {
    case 'flame':
      return <Flame className={className} style={color ? { color } : undefined} />;
    case 'folder':
      return <FolderOpen className={className} style={color ? { color } : undefined} />;
    case 'workflow':
      return <Workflow className={className} style={color ? { color } : undefined} />;
    case 'bot':
      return <Bot className={className} style={color ? { color } : undefined} />;
    case 'zap':
      return <Zap className={className} style={color ? { color } : undefined} />;
    case 'sparkles':
      return <Sparkles className={className} style={color ? { color } : undefined} />;
    case 'compass':
      return <Compass className={className} style={color ? { color } : undefined} />;
    case 'external':
      return <ExternalLink className={className} style={color ? { color } : undefined} />;
    default:
      return null;
  }
}

export function BrandMark({ compact = false }) {
  const { brand } = useBranding();
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    setImgError(false);
  }, [brand?.logoUrl]);

  const logoBgColor = brand?.logoBgColor || '#22d3ee';
  const logoTextColor = brand?.logoTextColor || '#000000';
  const brandName = brand?.brandName || 'koyosim';
  const logoHref = brand?.logoHref || '/studio';
  const logoTarget = brand?.logoTarget || '_self';

  return (
    <Link
      href={logoHref}
      target={logoTarget}
      className="group inline-flex items-center gap-2.5"
      aria-label={`${brandName} Studio`}
    >
      {brand?.logoUrl && !imgError ? (
        <div className="h-8 max-w-[200px] flex items-center justify-center transition-transform duration-base group-hover:scale-105">
          <img
            src={brand.logoUrl}
            alt={brandName}
            className="h-full w-auto max-h-8 max-w-[200px] object-contain"
            onError={() => setImgError(true)}
          />
        </div>
      ) : (
        <div
          className="size-8 rounded-lg flex items-center justify-center shadow-elevation-2 transition-transform duration-base group-hover:scale-105"
          style={{
            backgroundColor: logoBgColor,
            boxShadow: `0 4px 14px ${logoBgColor}33`,
          }}
        >
          <DynamicVectorIcon
            iconName={brand?.logoIcon || 'layers'}
            color={logoTextColor}
            className="size-5"
          />
        </div>
      )}

      {brand?.showBrandName && (
        <span className="text-base font-medium tracking-tight text-ink font-jost">
          {brandName}
        </span>
      )}
    </Link>
  );
}

export default function StudioHeader({
  title,
  subtitle,
  backHref = '/studio',
  backLabel = '返回工作室',
  showBack = false,
  className = '',
  locale = null,
}) {
  const pathname = usePathname();
  const { navigation } = useBranding();
  const [user, setUser] = useState(null);
  const [credits, setCredits] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountModalTab, setAccountModalTab] = useState('price-details');

  useEffect(() => {
    let active = true;
    fetch('/api/auth/me', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!active || !data) return;
        setUser(data.user || null);
        setCredits(data.entitlements?.credits ?? (data.user ? data.user.credits : null));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleOpen = (e) => {
      if (e.detail?.tab) setAccountModalTab(e.detail.tab);
      setIsAccountModalOpen(true);
    };
    window.addEventListener('open-account-modal', handleOpen);
    return () => window.removeEventListener('open-account-modal', handleOpen);
  }, []);

  const activeLocale = resolveClientLocale({ explicit: locale, pathname, userLocale: user?.locale });
  const isZh = activeLocale === 'zh-CN';
  const studioHref = isZh ? '/zh/studio' : '/studio';

  return (
    <>
      <header className={cn('sticky top-0 z-header h-14 border-b border-line-subtle bg-surface-glass backdrop-blur-md', className)}>
        <div className="flex h-full w-full items-center justify-between gap-4 px-4">
          {/* 左侧：返回 + BrandMark + 面板标题 */}
          <div className="flex min-w-0 items-center gap-3">
            {showBack && (
              <>
                <Link
                  href={backHref || studioHref}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-wash-strong hover:text-ink"
                >
                  <ArrowLeft className="size-4" />
                  <span className="hidden sm:inline">{backLabel || (isZh ? '返回工作室' : 'Back to Studio')}</span>
                </Link>
                <div className="hidden h-4 w-px bg-line sm:block" />
              </>
            )}

            <BrandMark compact />

            {/* 左侧：全站固定纯文字导航 (首页 + 社区) */}
            <nav className="flex items-center gap-1 sm:gap-2 ml-1 sm:ml-4" aria-label="核心主导航">
              <Link
                href={studioHref}
                className={cn(
                  'px-2.5 py-1 text-xs sm:text-sm font-medium transition-colors rounded-md',
                  pathname === '/' || pathname?.startsWith('/studio') || pathname?.startsWith('/zh/studio')
                    ? 'text-ink font-semibold'
                    : 'text-ink-muted hover:text-ink'
                )}
              >
                {isZh ? '首页' : 'Studio'}
              </Link>
              <Link
                href="/community"
                className={cn(
                  'px-2.5 py-1 text-xs sm:text-sm font-medium transition-colors rounded-md',
                  pathname?.startsWith('/community')
                    ? 'text-ink font-semibold'
                    : 'text-ink-muted hover:text-ink'
                )}
              >
                {isZh ? '社区' : 'Community'}
              </Link>
            </nav>

            {title && (
              <div className="hidden min-w-0 md:block ml-2 border-l border-line pl-3">
                <div className="truncate text-xs font-semibold tracking-[-0.01em] text-ink">{title}</div>
                {subtitle && <div className="truncate text-caption text-ink-subtle">{subtitle}</div>}
              </div>
            )}
          </div>

          {/* 右侧：右上角固定图标功能区 (额度/会员、提醒、语言切换、用户头像) */}
          <div className="flex items-center gap-2">
            <UserDropdownMenu
              user={user}
              credits={credits}
              locale={activeLocale}
              onOpenSettings={() => {
                setAccountModalTab('settings');
                setIsAccountModalOpen(true);
              }}
              onOpenAccount={(tab) => {
                setAccountModalTab(tab);
                setIsAccountModalOpen(true);
              }}
              onLogout={async () => {
                try {
                  await fetch('/api/auth/logout', { method: 'POST' });
                } catch {}
                setUser(null);
                setCredits(null);
                setIsAccountModalOpen(false);
                if (typeof window !== 'undefined') {
                  window.location.href = '/';
                }
              }}
              onOpenAuth={() => setShowAuthModal(true)}
            />
          </div>
        </div>
      </header>

      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onSuccess={(loggedInUser) => {
            setShowAuthModal(false);
            setUser(loggedInUser);
            if (loggedInUser?.credits !== undefined) setCredits(loggedInUser.credits);
          }}
        />
      )}

      {/* 个人中心悬浮窗 (在当前页面之上弹出，背景透出当前页面，点击背景直接关闭) */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={() => setIsAccountModalOpen(false)}
        initialTab={accountModalTab}
      />
    </>
  );
}

export function PageEyebrow({ children }) {
  return <span className="inline-flex items-center rounded-full border border-brand-line bg-brand-soft px-2.5 py-0.5 text-xs font-medium text-brand">{children}</span>;
}
