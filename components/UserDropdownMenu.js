'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import {
  UserRound,
  FolderOpen,
  WalletCards,
  Settings,
  Globe,
  ShieldCheck,
  LogOut,
  ChevronRight,
  Sparkles,
  Activity,
  Crown,
  Bell,
  Box,
  Check,
  Coins,
  Zap,
  KeyRound,
} from 'lucide-react';
import { resolveClientLocale } from '@/lib/locales';
import { avatarFrameClasses } from '@/lib/benefits/catalog';
import { localizedPathFor, switchLocale as applyLocaleSwitch } from '@/lib/client/localeSwitch';
import { FOCUS_RING } from 'studio/ui/tokens';
import { openGlobalAccountModal } from '@/lib/accountEvents';

const LANGUAGE_LIST = [
  { code: 'zh-CN', label: '简体中文', flag: '🇨🇳', native: '简体中文' },
  { code: 'zh-TW', label: '繁體中文', flag: '🇭🇰', native: '繁體中文' },
  { code: 'en', label: 'English', flag: '🇺🇸', native: 'English' },
  { code: 'ja-JP', label: '日本語', flag: '🇯🇵', native: '日本語' },
  { code: 'ko-KR', label: '한국어', flag: '🇰🇷', native: '한국어' },
  { code: 'es', label: 'Español', flag: '🇪🇸', native: 'Español' },
];

/**
 * 全站高级用户头像、功能胶囊群与悬浮动效菜单组件 (UserDropdownMenu)
 * 严格参考参考图视觉规范：
 * 1. AI 3D 预演特色动态胶囊
 * 2. 消息通知中心铃铛 (带真实未读粉红角标与通知浮层)
 * 3. 会员订阅高亮胶囊
 * 4. 算力/积分额度胶囊 (带 📦 图标与 FREE/PRO 状态)
 * 5. 全站用户头像 (带微光动效、在线呼吸灯与丝滑悬浮展开面板)
 */
export default function UserDropdownMenu({
  user,
  credits = null,
  locale = null,
  onOpenSettings,
  onOpenAccount,
  onLogout,
  onOpenAuth,
}) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isLangOpen, setIsLangOpen] = useState(false);
  const [showMenuLangSub, setShowMenuLangSub] = useState(false);
  const [liveAvatar, setLiveAvatar] = useState(null);
  const [userEntitlements, setUserEntitlements] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [coinBalance, setCoinBalance] = useState(0);
  const [dailyLoginClaimed, setDailyLoginClaimed] = useState(false);
  const [showCoinPop, setShowCoinPop] = useState(false);

  const menuRef = useRef(null);
  const notifRef = useRef(null);
  const langRef = useRef(null);
  const router = useRouter();
  const pathname = usePathname();

  const activeLocale = resolveClientLocale({ explicit: locale, pathname, userLocale: user?.locale });
  const isZh = activeLocale === 'zh-CN';

  const handleOpenPricing = useCallback((section = 'plans') => {
    setIsMenuOpen(false);
    setIsNotifOpen(false);
    // 注册表说了算：/pricing 只有 /zh 建了树，其余前缀拼出来就是 404。
    router.push(`${localizedPathFor('/pricing', activeLocale) || '/pricing'}#${section}`);
  }, [activeLocale, router]);

  // 统一打开个人中心弹窗
  const handleOpenAccountModal = useCallback((tab = 'price-details') => {
    setIsMenuOpen(false);
    setIsNotifOpen(false);
    if (onOpenAccount) {
      onOpenAccount(tab);
    } else {
      openGlobalAccountModal(tab);
    }
  }, [onOpenAccount]);

  // 硬币权益页：/zh 前缀之外没有第二棵树，注册表说了算
  const handleOpenBenefits = useCallback(() => {
    setIsMenuOpen(false);
    setIsNotifOpen(false);
    router.push(localizedPathFor('/benefits', activeLocale) || '/benefits');
  }, [activeLocale, router]);

  // 加载真实用户通知与未读数 (前后端真实联调)
  const fetchNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }
    try {
      const res = await fetch('/api/user/notifications', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
        setUnreadCount(Number(data.unreadCount || 0));
      }
    } catch {
      // 网络静默容错
    }
  }, [user]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // 加载硬币余额与今日登录打卡状态
  const fetchCoinStatus = useCallback(async () => {
    if (!user) {
      setCoinBalance(0);
      setDailyLoginClaimed(false);
      return;
    }
    try {
      const res = await fetch('/api/financial/currency/daily-login', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setCoinBalance(Number(data.balance || 0));
        setDailyLoginClaimed(Boolean(data.claimed));
      }
    } catch {}
  }, [user]);

  useEffect(() => {
    fetchCoinStatus();
  }, [fetchCoinStatus]);

  // 点击头像或硬币胶囊时，自动检查/触发每日登录 1 枚硬币奖励 (当天首次点击弹出增加动效)
  const triggerDailyLoginReward = useCallback(async () => {
    if (!user || dailyLoginClaimed) return;
    try {
      const res = await fetch('/api/financial/currency/daily-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.isFirstToday) {
          setCoinBalance(Number(data.balance || 0));
          setDailyLoginClaimed(true);
          setShowCoinPop(true);
          setTimeout(() => setShowCoinPop(false), 3000);
        } else if (data.claimed) {
          setDailyLoginClaimed(true);
        }
      }
    } catch {}
  }, [user, dailyLoginClaimed]);

  // 加载当前用户订阅套餐方案与权益
  useEffect(() => {
    if (!user) {
      setUserEntitlements(null);
      return;
    }
    let cancelled = false;
    fetch('/api/billing/entitlements', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data?.entitlements) {
          setUserEntitlements(data.entitlements);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 全部标记已读
  const handleMarkAllAsRead = async () => {
    try {
      const res = await fetch('/api/user/notifications', { method: 'POST' });
      if (res.ok) {
        setUnreadCount(0);
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
      }
    } catch {}
  };

  // 监听全站用户资料与头像更新广播 (0 延迟即时生效)
  useEffect(() => {
    const handleProfileUpdate = (e) => {
      if (e.detail?.avatarUrl !== undefined) {
        setLiveAvatar(e.detail.avatarUrl);
      } else if (e.detail?.user?.avatar_url !== undefined) {
        setLiveAvatar(e.detail.user.avatar_url);
      }
    };
    window.addEventListener('user-profile-updated', handleProfileUpdate);
    return () => {
      window.removeEventListener('user-profile-updated', handleProfileUpdate);
    };
  }, []);

  // 点击外部收起
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsMenuOpen(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setIsNotifOpen(false);
      }
      if (langRef.current && !langRef.current.contains(event.target)) {
        setIsLangOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setIsMenuOpen(false);
        setIsNotifOpen(false);
        setIsLangOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // 路由跳转时自动关闭
  useEffect(() => {
    setIsMenuOpen(false);
    setIsNotifOpen(false);
    setIsLangOpen(false);
    setShowMenuLangSub(false);
  }, [pathname]);

  // 复制 6 位不可变数字 ID
  const handleCopyUserNumber = (num, e) => {
    e?.stopPropagation();
    if (!num) return;
    navigator.clipboard?.writeText?.(String(num));
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 1800);
  };

  // 语言切换与持久化写入数据库
  const toggleLanguage = (targetLocaleOverride = null) => {
    const nextLocale = targetLocaleOverride || (isZh ? 'en' : 'zh-CN');
    setIsMenuOpen(false);
    applyLocaleSwitch({
      targetLocale: nextLocale,
      pathname: pathname || (typeof window !== 'undefined' ? window.location.pathname : '/'),
      search: typeof window !== 'undefined' ? window.location.search : '',
    });
  };

  // 退出登录
  const handleLogoutClick = async () => {
    setIsMenuOpen(false);
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    if (onLogout) await onLogout();
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  // 计算展示数据
  const displayName = user?.displayName || user?.display_name || user?.email?.split('@')[0] || (isZh ? 'AI 创作者' : 'AI Creator');
  const userNumber = user?.userNumber || user?.user_number;
  const avatarUrl = liveAvatar !== null ? liveAvatar : (user?.avatar || user?.avatar_url);
  const coinFrame = avatarFrameClasses(user?.avatarFrame || user?.avatar_frame);
  const initialLetter = displayName.slice(0, 1).toUpperCase();
  const isAdmin = user?.role === 'admin' || user?.role === 'super_admin';
  const effectiveCredits = credits !== null ? credits : (user?.credits ?? 0);

  // 计算订阅套餐徽章展示 (未订阅显示基础版/FREE，已订阅显示对应套餐名)
  const isPaidPlan = Boolean(userEntitlements?.isPaidSubscription);
  const rawPlanId = String(userEntitlements?.planId || user?.plan_id || 'free').toLowerCase();
  let planBadgeText = isZh ? '基础版' : 'FREE';
  if (isPaidPlan) {
    if (rawPlanId.includes('starter')) planBadgeText = 'STARTER';
    else if (rawPlanId.includes('basic')) planBadgeText = 'BASIC';
    else if (rawPlanId.includes('plus')) planBadgeText = 'PLUS';
    else if (rawPlanId.includes('pro')) planBadgeText = 'PRO';
    else planBadgeText = (userEntitlements?.planName || 'VIP').slice(0, 7).toUpperCase();
  }

  return (
    <>
    <div className="flex items-center gap-1.5 sm:gap-2">
      {/* 1. 消息通知中心铃铛 (固定图标，带粉红角标) */}
      <div className="relative" ref={notifRef}>
        <button
          type="button"
          onClick={() => {
            if (!user) {
              onOpenAuth?.();
              return;
            }
            setIsNotifOpen((prev) => !prev);
            setIsMenuOpen(false);
          }}
          className={`relative flex size-control-sm items-center justify-center rounded-full border transition-colors duration-fast ${
            isNotifOpen
              ? 'border-brand-line bg-brand-soft text-brand'
              : 'border-line bg-wash text-ink-muted hover:bg-wash-strong hover:text-ink'
          }`}
          aria-label={isZh ? '通知中心' : 'Notifications'}
          title={isZh ? '系统通知中心' : 'Notification Center'}
        >
          <Bell className="size-3.5" strokeWidth={1.8} />
          {unreadCount > 0 && (
            <span className="text-ink-on-accent absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-danger px-1 text-caption font-bold">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>

        {/* 通知中心悬浮弹层 */}
        {isNotifOpen && (
          <div className="border-line-strong bg-overlay-glass z-popover absolute right-0 top-full mt-2 w-80 rounded-xl p-3 text-ink shadow-elevation-4 backdrop-blur-md">
            <div className="border-line flex items-center justify-between border-b px-1 pb-2">
              <div className="flex items-center gap-1.5 text-label font-semibold text-ink">
                <Bell className="size-3.5 text-brand" strokeWidth={1.8} aria-hidden="true" />
                <span>{isZh ? '通知与公告' : 'Notifications'}</span>
                {unreadCount > 0 && (
                  <span className="text-mono rounded-xs bg-brand-soft px-1.5 py-0.5 text-brand">
                    {unreadCount}
                  </span>
                )}
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={handleMarkAllAsRead}
                  className={`text-caption text-ink-muted flex items-center gap-1 transition-colors duration-fast hover:text-brand ${FOCUS_RING}`}
                >
                  <Check className="size-3" strokeWidth={1.8} aria-hidden="true" />
                  <span>{isZh ? '全部已读' : 'Mark all read'}</span>
                </button>
              )}
            </div>

            {/* 消息列表 */}
            <div className="mt-2 max-h-popover space-y-1.5 overflow-y-auto pr-0.5">
              {notifications.length === 0 ? (
                <div className="text-ink-subtle py-8 text-center text-label">
                  {isZh ? '暂无新的系统通知' : 'No notifications'}
                </div>
              ) : (
                notifications.map((n) => {
                  // 无 link_url 的通知若仍渲染成 href="#"，点击会把页面滚到顶部：
                  // 一条死链。没有跳转目标时渲染为纯文本条目。
                  const itemClass = `block rounded-lg p-2.5 text-label transition-colors duration-fast ${
                    n.is_read
                      ? `${n.link_url ? 'hover:bg-wash hover:text-ink ' : ''}text-ink-muted`
                      : 'border-brand-line bg-brand-soft border text-ink'
                  }`;
                  const body = (
                    <>
                      <div className="flex items-start justify-between gap-1.5">
                        <p className="truncate font-semibold text-ink">{n.title}</p>
                        {!n.is_read && (
                          <span className="mt-1 size-1.5 shrink-0 rounded-full bg-brand" />
                        )}
                      </div>
                      <p className="text-caption text-ink-muted mt-1 line-clamp-2">
                        {n.content}
                      </p>
                    </>
                  );
                  return n.link_url ? (
                    <Link
                      key={n.id}
                      href={n.link_url}
                      onClick={() => setIsNotifOpen(false)}
                      className={itemClass}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div key={n.id} className={itemClass}>
                      {body}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* 2. 会员订阅入口
          Hidden below `md`: at 390px the header cluster overflowed its own
          box by ~190px and every control past it was unreachable. The same
          entry point survives in the account menu and on /pricing. */}
      <button
        type="button"
        onClick={() => handleOpenPricing('plans')}
        className="border-line bg-raised text-ink hover:border-brand-line hover:bg-wash-strong max-md:hidden flex h-control-sm items-center gap-1.5 rounded-full px-2.5 text-label font-semibold transition-colors duration-fast sm:px-3"
        title={isZh ? '点击打开会员订阅与权益升级' : 'Membership Subscription'}
      >
        <Crown className="size-3.5 text-warning" strokeWidth={1.8} aria-hidden="true" />
        <span className="font-semibold text-ink">{isZh ? '会员订阅' : 'VIP'}</span>
        <span className="bg-line mx-0.5 hidden h-3 w-px xs:inline-block" />
        <span className="text-warning hidden text-caption font-semibold tracking-tight xs:inline-block">
          {isZh ? '查看权益' : 'View plans'}
        </span>
      </button>

      {/* 3. 【📦 算力 + 订阅套餐状态】胶囊 (未订阅显示基础版/FREE，已订阅显示对应套餐) */}
      <button
        type="button"
        onClick={() => {
          if (!user) {
            onOpenAuth?.();
            return;
          }
          handleOpenAccountModal('membership');
        }}
        className="border-line bg-raised hover:border-line-strong hover:bg-wash-strong max-md:hidden flex h-control-sm items-center gap-1.5 rounded-full px-2.5 text-label font-medium text-ink-muted transition-colors duration-fast sm:px-3"
        title={isZh ? '查看订阅概况与套餐使用量' : 'Subscription & Quota Usage'}
      >
        <Box className="size-3.5 shrink-0 text-ink-subtle" strokeWidth={1.8} aria-hidden="true" />
        <span className="text-mono tabular-nums font-semibold text-ink">{effectiveCredits}</span>
        <span
          className={`rounded-xs border px-1.5 py-0.5 text-caption font-semibold uppercase tracking-wider ${
            isPaidPlan
              ? 'border-success-line bg-success-soft text-success'
              : 'border-line bg-wash text-ink-subtle'
          }`}
        >
          {planBadgeText}
        </span>
      </button>

      {/* 4. 语言切换固定图标与下拉选择浮层 */}
      <div className="relative inline-block" ref={langRef}>
        <button
          type="button"
          onClick={(e) => {
            e?.preventDefault?.();
            e?.stopPropagation?.();
            setIsLangOpen((prev) => !prev);
            setIsMenuOpen(false);
            setIsNotifOpen(false);
          }}
          className={`flex size-control-sm items-center justify-center rounded-full border transition-colors duration-fast ${
            isLangOpen
              ? 'border-brand-line bg-brand-soft text-brand'
              : 'border-line bg-wash text-ink-muted hover:bg-wash-strong hover:text-ink'
          }`}
          aria-label="选择语言 (Select Language)"
          aria-expanded={isLangOpen}
          aria-haspopup="true"
          title="选择站点语言 (Select Language)"
        >
          <Globe className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
        </button>

        {/* 语言选择下拉浮层 (毛玻璃暗黑质感 + 选中高亮与对勾) */}
        {isLangOpen && (
          <div
            className="border-line-strong bg-overlay-glass z-popover absolute right-0 top-full mt-2.5 w-44 rounded-xl p-1.5 text-ink shadow-elevation-4 backdrop-blur-md"
            role="menu"
            aria-label="语言选项"
          >
            <div className="border-line text-caption text-ink-subtle mb-1 flex items-center justify-between border-b px-2.5 py-1.5 font-semibold uppercase tracking-wider">
              <span>{isZh ? '界面语言' : 'Language'}</span>
            </div>
            <div className="space-y-0.5">
              {LANGUAGE_LIST.map((item) => {
                const isSelected = activeLocale === item.code || (item.code === 'zh-CN' && activeLocale === 'zh');
                return (
                  <button
                    key={item.code}
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setIsLangOpen(false);
                      toggleLanguage(item.code);
                    }}
                    className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast ${
                      isSelected
                        ? 'bg-brand-soft text-brand font-semibold'
                        : 'text-ink-muted hover:bg-wash hover:text-ink'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-body select-none">{item.flag}</span>
                      <span>{item.native}</span>
                    </div>
                    {isSelected && <Check className="size-3.5 shrink-0 text-brand" strokeWidth={1.8} aria-hidden="true" />}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 5. 【🪙 硬币】余额胶囊 (点击打卡并进入硬币权益页) */}
      {user && (
        <button
          type="button"
          onClick={() => {
            triggerDailyLoginReward();
            handleOpenBenefits();
          }}
          className="border-warning-line bg-warning-soft text-warning hover:border-warning max-md:hidden flex h-control-sm items-center gap-1.5 rounded-full px-2.5 text-label font-semibold transition-colors duration-fast sm:px-3"
          title={isZh ? `硬币 ${coinBalance} 枚：每日登录与有效提交可得，仅用于社区投币与兑换站内权益` : `Coins: ${coinBalance}`}
        >
          <Coins className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          <span className="text-mono tabular-nums font-semibold">
            {coinBalance}
          </span>
          <span className="text-caption hidden font-normal sm:inline">{isZh ? '硬币' : 'Coins'}</span>
        </button>
      )}

      {/* 6. 用户头像触发按钮与悬浮菜单 */}
      {!user ? (
        // 未登录状态：简约登录按钮
        <button
          type="button"
          onClick={onOpenAuth}
          className="bg-brand text-ink-on-accent hover:bg-brand-hover border-brand-line flex h-control-sm items-center gap-1 rounded-full px-3 text-label font-semibold transition-colors duration-fast"
        >
          <UserRound className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
          <span>{isZh ? '登录' : 'Log in'}</span>
        </button>
      ) : (
        <div className="relative inline-block text-left" ref={menuRef}>
          {/* 当天首次点击头像领到 1 枚硬币时的高光升腾浮动动效 */}
          {showCoinPop && (
            <div className="bg-warning text-ink-on-accent z-toast pointer-events-none absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-label font-bold shadow-elevation-3">
              <Coins className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
              <span>{isZh ? '+1 硬币已到账!' : '+1 coin credited!'}</span>
            </div>
          )}

          {/* 用户头像圆环触发按钮 (当天首次点击打卡自动领 1 枚硬币) */}
          <button
            type="button"
            onClick={() => {
              setIsMenuOpen((prev) => !prev);
              setIsNotifOpen(false);
              triggerDailyLoginReward();
            }}
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
            aria-label={isZh ? '用户菜单' : 'User Menu'}
            className={`relative flex items-center gap-2 rounded-full p-0.5 transition-colors duration-base ${FOCUS_RING} ${
              showCoinPop
                ? 'ring-2 ring-warning'
                : isMenuOpen
                  ? 'ring-2 ring-brand-ring'
                  : 'hover:ring-2 hover:ring-line-strong'
            }`}
          >
            <div className={`bg-raised text-brand relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-label font-bold ${coinFrame || 'border-line'}`}>
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
              ) : (
                <span className="select-none">{initialLetter}</span>
              )}
              {/* Presence dot: the ring matches the avatar tile so it reads as
                  a cut-out rather than a second border colour. */}
              <span className="absolute bottom-0 right-0 size-2 rounded-full bg-success ring-2 ring-surface" />
            </div>
          </button>

          {/* 悬浮展开用户菜单面板 */}
          {isMenuOpen && (
            <div
              className="border-line-strong bg-overlay-glass z-popover absolute right-0 top-full mt-2.5 w-72 rounded-xl p-3 text-ink shadow-elevation-4 backdrop-blur-md"
              role="menu"
              aria-orientation="vertical"
            >
              {/* (1) 顶部用户信息卡片 (大头像 + 昵称 + 6位UID + 直达个人主页) */}
              <div className="flex items-center justify-between gap-3 p-1">
                <div className="flex min-w-0 items-center gap-2.5">
                  <div className={`bg-raised text-brand flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-full text-body font-bold ${coinFrame || 'border border-line'}`}>
                    {avatarUrl ? (
                      <img src={avatarUrl} alt={displayName} className="size-full object-cover" />
                    ) : (
                      initialLetter
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-label truncate font-semibold text-ink" title={displayName}>
                        {displayName}
                      </p>
                      {isAdmin && (
                        <span className="rounded-xs border border-brand-line bg-brand-soft px-1 py-0.5 text-caption font-bold text-brand">
                          ADMIN
                        </span>
                      )}
                    </div>
                    {/* 不可变 6 位数字 ID 展示与点击复制 */}
                    <div className="mt-0.5 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => handleCopyUserNumber(userNumber, e)}
                        className={`text-mono text-caption text-ink-subtle truncate transition-colors duration-fast hover:text-brand ${FOCUS_RING}`}
                        title={isZh ? '点击复制 6 位唯一数字 ID' : 'Click to copy UID'}
                      >
                        {userNumber ? `UID: ${userNumber}` : (user?.email || (isZh ? '正式创作者' : 'Creator'))}
                      </button>
                      {copyFeedback && (
                        <span className="text-caption animate-fade-in font-medium text-success">
                          {isZh ? '已复制' : 'Copied'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* 前往个人主页 */}
                <Link
                  href="/account"
                  onClick={(e) => {
                    e.preventDefault();
                    handleOpenAccountModal('edit-profile');
                  }}
                  className="group text-caption text-ink-subtle flex shrink-0 items-center gap-0.5 transition-colors duration-fast hover:text-brand"
                  title={isZh ? '前往个人主页' : 'Go to profile'}
                >
                  <span>{isZh ? '主页' : 'Profile'}</span>
                  <ChevronRight className="size-3.5 transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
                </Link>
              </div>

              {/* (2) 算力与 VIP 权益卡片 (支持直接充值与升级) */}
              <div className="border-line bg-wash mt-2.5 mb-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-md border border-brand-line bg-brand-soft text-brand">
                      <Zap className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="text-caption text-ink-subtle">
                        {isZh ? '当前可用算力' : 'Credits Balance'}
                      </div>
                      <div className="text-mono font-semibold text-brand">
                        {effectiveCredits}
                      </div>
                    </div>
                  </div>

                  {/* 快捷升级 / 充值入口 */}
                  <button
                    type="button"
                    onClick={() => handleOpenAccountModal('points-details')}
                    className={`bg-raised border-line text-ink hover:border-line-strong hover:bg-overlay flex items-center gap-1 rounded-md border px-2.5 py-1 text-caption font-semibold transition-colors duration-fast ${FOCUS_RING}`}
                  >
                    <span>{isZh ? '充值/升级' : 'Top up'}</span>
                  </button>
                </div>
              </div>

              {/* (2.2) 硬币展示 (不可充值 · 仅供社区互动与权益兑换) */}
              <div className="border-warning-line bg-warning-soft mb-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex size-7 items-center justify-center rounded-md border border-warning-line text-warning">
                      <Coins className="size-3.5" strokeWidth={1.8} aria-hidden="true" />
                    </div>
                    <div>
                      <div className="text-caption text-ink-subtle">
                        {isZh ? '我的硬币' : 'My Coins'}
                      </div>
                      <div className="text-mono font-semibold text-warning">
                        {coinBalance}{' '}
                        <span className="text-caption text-ink-subtle">
                          ({dailyLoginClaimed ? (isZh ? '今日已打卡' : 'Checked in') : (isZh ? '点击头像领+1' : 'Click avatar +1')})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* 硬币权益页入口 */}
                  <button
                    type="button"
                    onClick={handleOpenBenefits}
                    className={`border-warning-line text-warning hover:border-warning flex items-center gap-1 rounded-md border px-2.5 py-1 text-caption font-semibold transition-colors duration-fast ${FOCUS_RING}`}
                  >
                    <span>{isZh ? '兑换权益' : 'Redeem'}</span>
                  </button>
                </div>
              </div>

              {/* (3) 核心功能列表 (带丝滑 Hover 位移与图标放大动效) */}
              <div className="space-y-0.5 pt-1">
                {/* 1. 我的作品 (个人作品资产直达) */}
                <Link
                  href="/creations"
                  onClick={() => setIsMenuOpen(false)}
                  className="group border-line bg-wash-strong text-ink hover:border-brand-line hover:bg-wash flex w-full items-center justify-between rounded-md border px-2.5 py-2 text-label font-medium transition-colors duration-fast mb-1"
                >
                  <div className="flex items-center gap-2.5">
                    <FolderOpen className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                    <span className="font-semibold">{isZh ? '我的作品' : 'My Creations'}</span>
                  </div>
                  <ChevronRight className="size-3.5 text-ink-subtle transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
                </Link>

                {/* 2. 创作活跃与偏好 */}
                <button
                  type="button"
                  onClick={() => handleOpenAccountModal('activity')}
                  className="group text-ink-muted hover:bg-wash hover:text-ink flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
                >
                  <div className="flex items-center gap-2.5">
                    <Activity className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                    <span>{isZh ? '创作活跃与偏好' : 'Activity & Preferences'}</span>
                  </div>
                  <ChevronRight className="size-3.5 text-ink-subtle transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
                </button>

                {/* 3. 会员订阅与价格 */}
                <button
                  type="button"
                  onClick={() => handleOpenPricing('plans')}
                  className="group text-ink-muted hover:bg-wash hover:text-ink flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
                >
                  <div className="flex items-center gap-2.5">
                    <Crown className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                    <span>{isZh ? '会员订阅与方案' : 'Membership & Plans'}</span>
                  </div>
                  <span className="rounded-full border border-brand-line bg-brand-soft px-1.5 py-0.5 text-caption font-bold text-brand">
                    VIP
                  </span>
                </button>

                {/* 4. 积分资产与明细 */}
                <button
                  type="button"
                  onClick={() => handleOpenAccountModal('points-details')}
                  className="group text-ink-muted hover:bg-wash hover:text-ink flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
                >
                  <div className="flex items-center gap-2.5">
                    <WalletCards className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                    <span>{isZh ? '积分资产与明细' : 'Credits & Balance'}</span>
                  </div>
                  <ChevronRight className="size-3.5 text-ink-subtle transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
                </button>

                {/* 5. 个人资料与安全 */}
                <button
                  type="button"
                  onClick={() => handleOpenAccountModal('edit-profile')}
                  className="group text-ink-muted hover:bg-wash hover:text-ink flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
                >
                  <div className="flex items-center gap-2.5">
                    <UserRound className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                    <span>{isZh ? '个人资料与安全' : 'Profile & Security'}</span>
                  </div>
                  <ChevronRight className="size-3.5 text-ink-subtle transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
                </button>

                {/* 6. 偏好设置 (直达个人中心真实设置，支持通知/画质/语言) */}
                <button
                  type="button"
                  onClick={() => handleOpenAccountModal('settings')}
                  className="group text-ink-muted hover:bg-wash hover:text-ink flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
                >
                  <div className="flex items-center gap-2.5">
                    <Settings className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                    <span>{isZh ? '偏好设置' : 'Preferences & Settings'}</span>
                  </div>
                  <ChevronRight className="size-3.5 text-ink-subtle transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
                </button>

                {/* 7. Agent API 密钥 */}
                <button
                  type="button"
                  onClick={() => handleOpenAccountModal('agent-api-key')}
                  className="group text-ink-muted hover:bg-wash hover:text-ink flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
                >
                  <div className="flex items-center gap-2.5">
                    <KeyRound className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                    <span>{isZh ? 'Agent API 密钥' : 'Agent API Key'}</span>
                  </div>
                  <ChevronRight className="size-3.5 text-ink-subtle transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
                </button>

                {/* 8. 界面语言切换与展开列表 */}
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e?.preventDefault?.();
                      e?.stopPropagation?.();
                      setShowMenuLangSub((prev) => !prev);
                    }}
                    className="group text-ink-muted hover:bg-wash hover:text-ink flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
                  >
                    <div className="flex items-center gap-2.5">
                      <Globe className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                      <span>{isZh ? '界面语言' : 'Language'}</span>
                    </div>
                    <div className="text-caption text-ink-subtle flex items-center gap-1">
                      <span>{activeLocale === 'zh-CN' || activeLocale === 'zh' ? '简体中文' : activeLocale === 'zh-TW' ? '繁體中文' : activeLocale === 'ja-JP' ? '日本語' : activeLocale === 'ko-KR' ? '한국어' : activeLocale === 'es' ? 'Español' : 'English'}</span>
                      <ChevronRight className={`size-3.5 transition-transform duration-fast ${showMenuLangSub ? 'rotate-90 text-brand' : ''}`} strokeWidth={1.8} aria-hidden="true" />
                    </div>
                  </button>

                  {/* 展开的语言子列表 */}
                  {showMenuLangSub && (
                    <div className="border-line bg-wash space-y-0.5 rounded-lg border py-1 pl-6 pr-1">
                      {LANGUAGE_LIST.map((item) => {
                        const isSelected = activeLocale === item.code || (item.code === 'zh-CN' && activeLocale === 'zh');
                        return (
                          <button
                            key={item.code}
                            type="button"
                            onClick={() => {
                              setIsMenuOpen(false);
                              toggleLanguage(item.code);
                            }}
                            className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-caption transition-colors duration-fast ${
                              isSelected
                                ? 'text-brand font-semibold'
                                : 'text-ink-muted hover:bg-wash-strong hover:text-ink'
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              <span>{item.flag}</span>
                              <span>{item.native}</span>
                            </span>
                            {isSelected && <Check className="size-3 text-brand" strokeWidth={1.8} aria-hidden="true" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* 管理员控制台 (仅限管理员) */}
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setIsMenuOpen(false)}
                    className="group text-ink-muted hover:bg-wash hover:text-ink flex w-full items-center justify-between rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
                  >
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck className="size-4 text-ink-subtle transition-transform duration-fast group-hover:scale-110" strokeWidth={1.8} aria-hidden="true" />
                      <span>{isZh ? '管理控制台' : 'Admin Console'}</span>
                    </div>
                    <ChevronRight className="size-3.5 text-ink-subtle transition-transform duration-fast group-hover:translate-x-0.5" strokeWidth={1.8} aria-hidden="true" />
                  </Link>
                )}
              </div>

              {/* (4) 底部分割线与退出登录 */}
              <div className="bg-line my-1.5 h-px" />

              <button
                type="button"
                onClick={handleLogoutClick}
                className="group text-ink-muted hover:bg-danger-soft hover:text-danger flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-label transition-colors duration-fast"
              >
                <LogOut className="size-4 text-ink-subtle transition-colors duration-fast group-hover:text-danger" strokeWidth={1.8} aria-hidden="true" />
                <span>{isZh ? '退出登录' : 'Sign out'}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>

    </>
  );
}
