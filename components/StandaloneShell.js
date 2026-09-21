'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter, usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { getUserBalance, applyActiveModelDirectory } from 'studio';
import { Spinner } from 'studio/ui/feedback';
import { Button, IconButton } from 'studio/ui/button';
import { Modal, ModalContent } from 'studio/ui/overlay';
import axios from 'axios';
import AuthModal from './AuthModal';
import { StudioResourceBoundary } from './StudioResourceBoundary';

// Each workbench is a heavy subtree (Konva canvases, pollers, editors). Loading
// them through the `studio` barrel mounted all seventeen on every /studio visit,
// so each one is fetched as its own chunk and mounted only while it is active.
const studioFallback = () => (
  <div className="bg-canvas flex h-full w-full items-center justify-center"><Spinner className="text-brand" /></div>
);
const dynamicStudio = (loader) => dynamic(loader, { ssr: false, loading: studioFallback });
const ImageStudio = dynamicStudio(() => import('studio/ImageStudio'));
const VideoStudio = dynamicStudio(() => import('studio/VideoStudio'));
const AudioStudio = dynamicStudio(() => import('studio/AudioStudio'));
const LayersStudio = dynamicStudio(() => import('studio/LayersStudio'));
const ClippingStudio = dynamicStudio(() => import('studio/ClippingStudio'));
const MotionControlStudio = dynamicStudio(() => import('studio/MotionControlStudio'));
const VibeMotionStudio = dynamicStudio(() => import('studio/VibeMotionStudio'));
const LipSyncStudio = dynamicStudio(() => import('studio/LipSyncStudio'));
const RecastStudio = dynamicStudio(() => import('studio/RecastStudio'));
const CinemaStudio = dynamicStudio(() => import('studio/CinemaStudio'));
const MarketingStudio = dynamicStudio(() => import('studio/MarketingStudio'));
const WorkflowStudio = dynamicStudio(() => import('studio/WorkflowStudio'));
const AgentStudio = dynamicStudio(() => import('studio/AgentStudio'));
const AppsStudio = dynamicStudio(() => import('studio/AppsStudio'));
const AiInfluencerStudio = dynamicStudio(() => import('studio/AiInfluencerStudio'));
const DesignAgentStudio = dynamicStudio(() => import('studio/DesignAgentStudio'));
const HeadshotStudio = dynamicStudio(() => import('./HeadshotStudio'));
import LanguageSwitcher from './LanguageSwitcher';
import UserDropdownMenu from './UserDropdownMenu';
import AccountModal from './account/AccountModal';
import { getCommonCopy, getLocaleConfig, localizeStudioPath, normalizeLocale } from '@/lib/locales';
import { STUDIO_TAB_IDS } from '@/lib/studio-routes';
import {
  AlertCircle,
  Check,
  ChevronDown,
  Flame,
  FolderOpen,
  Menu,
  PanelLeft,
  Sparkles,
  Wand2,
  Box,
  Bot,
  Compass,
  ExternalLink,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { useBranding } from '@/lib/hooks/useBranding';

function DynamicVectorIcon({ iconName, color = 'currentColor', className = 'w-5 h-5' }) {
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

function DynamicNavIcon({ iconName, color, className = 'w-3.5 h-3.5' }) {
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

// Tab/category ids, icons, and English `label` fallbacks are stable
// identifiers, not locale copy — the actual rendered label is resolved
// per-locale from `copy.tabs`/`copy.categories` via tabLabel()/categoryLabel()
// inside the component below, with these English strings as the fallback
// when a locale bundle is missing the key.
const TABS = [
  {
    id: 'image',
    label: 'Image Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <polyline points="21 15 16 10 5 21"/>
      </svg>
    )
  },
  {
    id: 'headshot',
    label: 'AI Headshot',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
        <circle cx="12" cy="7" r="4"/>
      </svg>
    )
  },
  {
    id: 'layers',
    label: 'Layers Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2"/>
        <polyline points="2 17 12 22 22 17"/>
        <polyline points="2 12 12 17 22 12"/>
      </svg>
    )
  },
  {
    id: 'video',
    label: 'Video Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="23 7 16 12 23 17 23 7"/>
        <rect x="1" y="5" width="15" height="14" rx="2" ry="2"/>
      </svg>
    )
  },
  {
    id: 'audio',
    label: 'Audio Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'clipping',
    label: 'AI Clipping',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="6" cy="6" r="3"/>
        <circle cx="6" cy="18" r="3"/>
        <line x1="20" y1="4" x2="8.12" y2="15.88"/>
        <line x1="14.47" y1="14.47" x2="20" y2="20"/>
        <line x1="8.12" y1="8.12" x2="12" y2="12"/>
      </svg>
    )
  },
  {
    id: 'motion-control',
    label: 'Motion Control',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="5" r="3"/>
        <line x1="12" y1="8" x2="12" y2="14"/>
        <path d="M9 11l3 3 3-3"/>
        <path d="M7 21l5-5 5 5"/>
      </svg>
    )
  },
  {
    id: 'vibe-motion',
    label: 'Vibe Motion',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
      </svg>
    )
  },
  {
    id: 'lipsync',
    label: 'Lip Sync',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        <line x1="12" y1="19" x2="12" y2="22"/>
      </svg>
    )
  },
  {
    id: 'body-swap',
    label: 'Body Swap',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
        <circle cx="8.5" cy="7" r="4"/>
        <polyline points="17 11 19 13 23 9"/>
        <path d="M23 13v-2"/>
      </svg>
    )
  },
  {
    id: 'cinema',
    label: 'Cinema Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/>
        <line x1="7" y1="2" x2="7" y2="22"/>
        <line x1="17" y1="2" x2="17" y2="22"/>
        <line x1="2" y1="12" x2="22" y2="12"/>
        <line x1="2" y1="7" x2="7" y2="7"/>
        <line x1="2" y1="17" x2="7" y2="17"/>
        <line x1="17" y1="17" x2="22" y2="17"/>
        <line x1="17" y1="7" x2="22" y2="7"/>
      </svg>
    )
  },
  {
    id: 'marketing',
    label: 'Marketing Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <line x1="8" y1="9" x2="16" y2="9"/>
        <line x1="8" y1="13" x2="14" y2="13"/>
      </svg>
    )
  },
  {
    id: 'workflows',
    label: 'Workflows',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="6" height="6" rx="1"/>
        <rect x="15" y="3" width="6" height="6" rx="1"/>
        <rect x="9" y="15" width="6" height="6" rx="1"/>
        <path d="M6 9v3a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9"/>
        <path d="M12 13v2"/>
      </svg>
    )
  },
  {
    id: 'agents',
    label: 'Agents',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="10" rx="2"/>
        <circle cx="12" cy="5" r="2"/>
        <path d="M12 7v4"/>
        <line x1="8" y1="16" x2="8.01" y2="16"/>
        <line x1="16" y1="16" x2="16.01" y2="16"/>
      </svg>
    )
  },
  {
    id: 'design-agent',
    label: 'Design Agent',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 19l7-7 3 3-7 7-3-3z"/>
        <path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
        <path d="M2 2l7.586 7.586"/>
        <circle cx="11" cy="11" r="2"/>
      </svg>
    )
  },
  {
    id: 'apps',
    label: 'Explore Apps',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="14" y="14" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
      </svg>
    )
  },
  {
    id: 'ai-influencer',
    label: 'AI Influencer Studio',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
      </svg>
    )
  }
];

const NAVIGATION_CATEGORIES = [
  {
    id: 'images',
    label: 'Images',
    tabIds: ['image', 'headshot', 'layers', 'design-agent', 'ai-influencer'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2"/>
        <circle cx="8.5" cy="8.5" r="1.5"/>
        <path d="M21 15l-5-5L5 21"/>
      </svg>
    )
  },
  {
    id: 'video',
    label: 'Video',
    tabIds: ['cinema', 'video', 'clipping', 'motion-control', 'vibe-motion', 'lipsync', 'body-swap', 'marketing'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="4" width="15" height="16" rx="2"/>
        <path d="M17 9l5-3v12l-5-3"/>
        <path d="M8 9l4 3-4 3z"/>
      </svg>
    )
  },
  {
    id: 'audio',
    label: 'Audio',
    tabIds: ['audio'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18V5l12-2v13"/>
        <circle cx="6" cy="18" r="3"/>
        <circle cx="18" cy="16" r="3"/>
      </svg>
    )
  },
  {
    id: 'agents-automation',
    label: 'Agents & Automation',
    tabIds: ['agents', 'workflows'],
    icon: (
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="6" height="6" rx="1"/>
        <rect x="15" y="3" width="6" height="6" rx="1"/>
        <rect x="9" y="15" width="6" height="6" rx="1"/>
        <path d="M6 9v2a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V9"/>
        <path d="M12 13v2"/>
      </svg>
    )
  }
];

const EXPLORE_APPS_TAB = TABS.find((tab) => tab.id === 'apps');

const getNavigationCategory = (tabId) => (
  NAVIGATION_CATEGORIES.find((category) => category.tabIds.includes(tabId))
);

const STORAGE_KEY = 'muapi_key';
const NOTIFICATIONS_STORAGE_KEY = 'open_gen_notifications_v1';
const MAX_VISIBLE_NOTIFICATIONS = 3;

const loadStoredNotifications = () => {
  if (typeof window === 'undefined') return [];

  try {
    const stored = JSON.parse(window.sessionStorage.getItem(NOTIFICATIONS_STORAGE_KEY) || '[]');
    const now = Date.now();
    return Array.isArray(stored)
      ? stored.filter((notification) => notification.expiresAt > now).slice(0, MAX_VISIBLE_NOTIFICATIONS)
      : [];
  } catch {
    return [];
  }
};

const persistNotifications = (notifications) => {
  if (typeof window === 'undefined') return;

  try {
    window.sessionStorage.setItem(
      NOTIFICATIONS_STORAGE_KEY,
      JSON.stringify(notifications),
    );
  } catch {
    // Notification persistence is optional; rendering still works without storage.
  }
};

export default function StandaloneShell({ locale = 'en' }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname() || '';
  const slug = params?.slug || [];
  const idFromParams = params?.id;
  const tabFromParams = params?.tab;
  const { brand: siteBrand, navigation: siteNavigation } = useBranding();
  const [logoImgError, setLogoImgError] = useState(false);

  useEffect(() => {
    setLogoImgError(false);
  }, [siteBrand?.logoUrl]);

  const isZh = normalizeLocale(locale) === 'zh-CN';
  const copy = getCommonCopy(locale);
  const nativeLocaleName = getLocaleConfig(locale).nativeName;
  const tabLabel = useCallback(
    (tabId) => copy.tabs?.[tabId] || TABS.find((t) => t.id === tabId)?.label || tabId,
    [copy],
  );
  const categoryLabel = useCallback(
    (categoryId) => copy.categories?.[categoryId] || NAVIGATION_CATEGORIES.find((c) => c.id === categoryId)?.label || categoryId,
    [copy],
  );
  const studioPath = useCallback((tabId) => localizeStudioPath(locale, tabId), [locale]);

  // Helper to extract workflow details precisely from either route structure
  const getWorkflowInfo = useCallback(() => {
    if (idFromParams) {
        return { id: idFromParams, tab: tabFromParams || null };
    }
    const wfIndex = slug.findIndex(s => s === 'workflows' || s === 'workflow');
    if (wfIndex === -1) return { id: null, tab: null };
    return {
      id: slug[wfIndex + 1] || null,
      tab: slug[wfIndex + 2] || null
    };
  }, [slug, idFromParams, tabFromParams]);

  const { id: urlWorkflowId } = getWorkflowInfo();

  // Initialize activeTab from URL slug/params or default to 'image'
  const getInitialTab = () => {
    if (idFromParams || slug.includes('workflow')) return 'workflows';
    if (slug.includes('agents')) return 'agents';
    if (slug.includes('design-agent')) return 'design-agent';
    if (slug.includes('apps')) return 'apps';
    const firstSegment = slug[0];
    if (firstSegment && STUDIO_TAB_IDS.includes(firstSegment)) return firstSegment;
    return 'image';
  };
  
  const [apiKey, setApiKey] = useState(null);
  const [activeTab, setActiveTab] = useState(getInitialTab());

  const [balance, setBalance] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [isHeaderVisible, setIsHeaderVisible] = useState(true);
  const [hasMounted, setHasMounted] = useState(false);
  const [accountUser, setAccountUser] = useState(null);
  const [accountChecked, setAccountChecked] = useState(false);
  const [accountCredits, setAccountCredits] = useState(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const pendingAuthResolverRef = useRef(null);

  const refreshAccount = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (data.user) {
        setAccountUser(data.user);
        setAccountCredits(data.entitlements?.credits ?? null);
        return data.user;
      } else {
        setAccountUser(null);
        setAccountCredits(null);
        return null;
      }
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    refreshAccount().finally(() => setAccountChecked(true));
  }, [refreshAccount]);

  // 全站用户资料与头像变更事件总线监听 (即时响应无需整页刷新)
  useEffect(() => {
    const handleProfileUpdated = (e) => {
      if (e.detail?.avatarUrl !== undefined || e.detail?.user) {
        if (e.detail.user) {
          setAccountUser((prev) => (prev ? { ...prev, ...e.detail.user } : e.detail.user));
        } else if (e.detail.avatarUrl !== undefined) {
          setAccountUser((prev) =>
            prev ? { ...prev, avatar_url: e.detail.avatarUrl, avatar: e.detail.avatarUrl } : prev
          );
        }
      }
      refreshAccount();
    };
    window.addEventListener('user-profile-updated', handleProfileUpdated);
    return () => window.removeEventListener('user-profile-updated', handleProfileUpdated);
  }, [refreshAccount]);

  // 全局额度守卫：当点击消耗模型额度的动作时被触发
  const requireAccountGate = useCallback(() => {
    return new Promise(async (resolve, reject) => {
      // 1. 如果已有登录用户或已有 apiKey，直接放行
      if (accountUser) {
        resolve(accountUser);
        return;
      }
      const currentUser = await refreshAccount();
      if (currentUser) {
        resolve(currentUser);
        return;
      }
      // 2. 未登录，挂起 Promise 并打开 AuthModal 弹窗
      pendingAuthResolverRef.current = { resolve, reject };
      setShowAuthModal(true);
    });
  }, [accountUser, refreshAccount]);

  // muapi 层遇到 401/403 只派发 muapi:auth-required，此前无人监听，token 过期后页面
  // 只是静默显示空数据；接回现有 AuthModal 才会真正提示重新登录。
  useEffect(() => {
    const handleAuthRequired = () => {
      setApiKey(null);
      setAccountUser(null);
      setAccountCredits(null);
      setShowAuthModal(true);
    };
    window.addEventListener('muapi:auth-required', handleAuthRequired);
    return () => window.removeEventListener('muapi:auth-required', handleAuthRequired);
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.__KOYOSIM_REQUIRE_ACCOUNT__ = requireAccountGate;
      window.__KOYOSIM_REQUIRE_API_KEY__ = async () => {
        const user = await requireAccountGate();
        return user ? 'koyosim-account-session' : null;
      };
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete window.__KOYOSIM_REQUIRE_ACCOUNT__;
        delete window.__KOYOSIM_REQUIRE_API_KEY__;
      }
    };
  }, [requireAccountGate]);

  // Global generation notifications remain mounted while users switch studios.
  const [notifications, setNotifications] = useState([]);
  const [notificationsHydrated, setNotificationsHydrated] = useState(false);
  const [generationCounts, setGenerationCounts] = useState({});

  // 个人中心悬浮窗状态
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [accountModalTab, setAccountModalTab] = useState('price-details');

  useEffect(() => {
    setNotifications(loadStoredNotifications());
    setNotificationsHydrated(true);
  }, []);

  const pushNotification = useCallback((notif) => {
    const now = Date.now();
    const id = `notif-${Date.now()}-${Math.random()}`;
    const ttl = 12000;
    const entry = { ...notif, id, expiresAt: now + ttl };
    setNotifications((previous) => {
      const next = [
        ...previous.filter((notification) => notification.expiresAt > now),
        entry,
      ].slice(-MAX_VISIBLE_NOTIFICATIONS);
      persistNotifications(next);
      return next;
    });
  }, []);

  const dismissNotification = useCallback((id) => {
    setNotifications((previous) => {
      const next = previous.filter((notification) => notification.id !== id);
      persistNotifications(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!notificationsHydrated) return;

    persistNotifications(notifications);
  }, [notifications, notificationsHydrated]);

  useEffect(() => {
    if (notifications.length === 0) return undefined;

    const nextExpiry = Math.min(...notifications.map((notification) => notification.expiresAt));
    const timer = window.setTimeout(() => {
      const now = Date.now();
      setNotifications((previous) => previous.filter((notification) => notification.expiresAt > now));
    }, Math.max(0, nextExpiry - Date.now()));

    return () => window.clearTimeout(timer);
  }, [notifications]);

  // 监听 URL 中的 account=open 参数或全局 open-account-modal 自定义事件
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('account') === 'open' || params.has('action')) {
      const tab = params.get('action') || 'price-details';
      setAccountModalTab(tab);
      setIsAccountModalOpen(true);
    }

    const handleOpenAccount = (e) => {
      if (e.detail?.tab) {
        setAccountModalTab(e.detail.tab);
      }
      setIsAccountModalOpen(true);
    };

    window.addEventListener('open-account-modal', handleOpenAccount);
    return () => {
      window.removeEventListener('open-account-modal', handleOpenAccount);
    };
  }, []);

  const handleCloseAccountModal = useCallback(() => {
    setIsAccountModalOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('account') || url.searchParams.has('action')) {
        url.searchParams.delete('account');
        url.searchParams.delete('action');
        window.history.replaceState(null, '', url.toString());
      }
    }
  }, []);

  const handleLogout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    setAccountUser(null);
    setAccountCredits(null);
    setIsAccountModalOpen(false);
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('muapi_key');
        localStorage.removeItem('ko_user');
      } catch {}
      window.location.href = '/';
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const searchParams = new URLSearchParams(window.location.search);
    const remixPrompt = searchParams.get('remixPrompt');
    if (remixPrompt) {
      pushNotification({
        type: 'success',
        tabId: activeTab,
        label: '即梦社区同款',
        message: `已自动载入同款提示词: "${remixPrompt.slice(0, 25)}..."`,
      });
      setTimeout(() => {
        const textareas = document.querySelectorAll('textarea');
        if (textareas.length > 0) {
          const target = textareas[0];
          target.value = remixPrompt;
          target.dispatchEvent(new Event('input', { bubbles: true }));
          target.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }, 600);
    }
  }, [activeTab, pushNotification]);

  const handleAuthSuccess = useCallback((user, entitlements) => {
    setAccountUser(user);
    setAccountCredits(entitlements?.credits ?? 10);
    setShowAuthModal(false);
    if (pendingAuthResolverRef.current) {
      const { resolve } = pendingAuthResolverRef.current;
      pendingAuthResolverRef.current = null;
      resolve(user);
    }
  }, []);

  const handleAuthClose = useCallback(() => {
    setShowAuthModal(false);
    if (pendingAuthResolverRef.current) {
      const { reject } = pendingAuthResolverRef.current;
      pendingAuthResolverRef.current = null;
      reject(new Error('用户取消了登录'));
    }
  }, []);

  // 监听全局登录成功事件与三方登录 URL 回调
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleGlobalAuthSuccess = (e) => {
      if (e.detail?.user) {
        handleAuthSuccess(e.detail.user, e.detail.entitlements);
      }
    };
    window.addEventListener('koyosim-auth-success', handleGlobalAuthSuccess);

    // 检查 URL 中的三方登录状态参数
    const searchParams = new URLSearchParams(window.location.search);
    const authStatus = searchParams.get('auth');
    const authMsg = searchParams.get('msg');
    if (authStatus === 'success') {
      pushNotification({
        type: 'success',
        tabId: activeTab,
        label: isZh ? '第三方快捷登录' : 'Social Login',
        message: isZh ? '登录成功，欢迎来到 KoyoSIM AI Studio！' : 'Login successful, welcome to KoyoSIM AI Studio!',
      });
      refreshAccount();
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('auth');
      nextUrl.searchParams.delete('msg');
      window.history.replaceState(null, '', nextUrl.toString());
    } else if (authStatus === 'error') {
      pushNotification({
        type: 'error',
        tabId: activeTab,
        label: isZh ? '第三方登录失败' : 'Social Login Failed',
        message: authMsg || (isZh ? '授权未完成或已被取消，请重试' : 'Authorization failed or cancelled, please retry'),
      });
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete('auth');
      nextUrl.searchParams.delete('msg');
      window.history.replaceState(null, '', nextUrl.toString());
    }

    return () => {
      window.removeEventListener('koyosim-auth-success', handleGlobalAuthSuccess);
    };
  }, [handleAuthSuccess, pushNotification, activeTab, isZh, refreshAccount]);


  // 动态动效配置与特性开关
  const [motionConfig, setMotionConfig] = useState({
    motionLevel: 'full',
    ambientGlow: true,
    cardTiltHover: true,
    bannerPulse: true,
  });
  const [showExploreApps, setShowExploreApps] = useState(false);
  // A failed model-directory fetch leaves every workbench without selectable
  // models, so that failure must be surfaced and retryable, not a silent empty list.
  const [modelDirectoryState, setModelDirectoryState] = useState('loading');
  const [studioConfigAttempt, setStudioConfigAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setModelDirectoryState('loading');
    async function initStudioConfig() {
      try {
        const [contentRes, modelsRes] = await Promise.all([
          fetch('/api/site/content-config').catch(() => null),
          fetch('/api/models/active').catch(() => null),
        ]);
        if (!active) return;

        if (contentRes && contentRes.ok) {
          const contentData = await contentRes.json().catch(() => null);
          if (contentData?.motion) setMotionConfig(contentData.motion);
          if (contentData?.features?.explore_apps_enabled !== undefined) {
            setShowExploreApps(Boolean(contentData.features.explore_apps_enabled));
          }
        }

        if (modelsRes && modelsRes.ok) {
          const modelsData = await modelsRes.json().catch(() => null);
          if (Array.isArray(modelsData?.models) && typeof applyActiveModelDirectory === 'function') {
            applyActiveModelDirectory(modelsData.models);
            setModelDirectoryState('ready');
            return;
          }
        }
        setModelDirectoryState('error');
      } catch (err) {
        console.warn('Failed to load studio config:', err?.message || err);
        if (active) setModelDirectoryState('error');
      }
    }
    initStudioConfig();
    return () => { active = false; };
  }, [studioConfigAttempt]);

  // Sidebar Collapsed & Mobile Drawer State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(() => {
    if (typeof window !== 'undefined') return localStorage.getItem('sidebar_collapsed') === 'true';
    return false;
  });
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [expandedCategoryId, setExpandedCategoryId] = useState(() => (
    getNavigationCategory(getInitialTab())?.id || NAVIGATION_CATEGORIES[0].id
  ));
  const activeCategory = getNavigationCategory(activeTab);

  const toggleSidebar = useCallback(() => {
    setIsSidebarCollapsed(prev => {
      const next = !prev;
      localStorage.setItem('sidebar_collapsed', next ? 'true' : 'false');
      return next;
    });
  }, []);

  const handleCategoryToggle = useCallback((categoryId) => {
    const isCollapsedNavigation = isSidebarCollapsed && !isMobileOpen;

    if (!isCollapsedNavigation) {
      setExpandedCategoryId((currentId) => (
        currentId === categoryId ? null : categoryId
      ));
      return;
    }

    setExpandedCategoryId(categoryId);
    toggleSidebar();
  }, [isMobileOpen, isSidebarCollapsed, toggleSidebar]);

  useEffect(() => {
    if (activeCategory?.id) {
      setExpandedCategoryId(activeCategory.id);
    }
  }, [activeCategory?.id]);

  // Drag and Drop State
  const [isDragging, setIsDragging] = useState(false);
  const [droppedFiles, setDroppedFiles] = useState(null);

  const fetchBalance = useCallback(async (key) => {
    try {
      const data = await getUserBalance(key);
      setBalance(data.balance);
    } catch (err) {
      console.error('Balance fetch failed:', err);
    }
  }, []);

  const makeSuccessCallback = useCallback((tabId) => (data) => {
    const tab = TABS.find(t => t.id === tabId);
    pushNotification({
      type: 'success',
      tabId,
      label: tab?.label || tabId,
      resultUrl: data?.url || null,
    });
  }, [pushNotification]);

  const makeErrorCallback = useCallback((tabId) => (errorOrMessage) => {
    const tab = TABS.find(t => t.id === tabId);
    const message = typeof errorOrMessage === 'string'
      ? errorOrMessage
      : (errorOrMessage?.message || errorOrMessage?.error || String(errorOrMessage || 'Generation failed'));
    pushNotification({ type: 'error', tabId, label: tab?.label || tabId, message });
    if (apiKey) void fetchBalance(apiKey);
  }, [apiKey, fetchBalance, pushNotification]);

  const makeGenerationStartCallback = useCallback((tabId) => () => {
    setGenerationCounts((previous) => ({
      ...previous,
      [tabId]: (previous[tabId] || 0) + 1,
    }));
  }, []);

  const makeGenerationEndCallback = useCallback((tabId) => () => {
    setGenerationCounts((previous) => {
      const currentCount = previous[tabId] || 0;
      if (currentCount <= 1) {
        const next = { ...previous };
        delete next[tabId];
        return next;
      }

      return {
        ...previous,
        [tabId]: currentCount - 1,
      };
    });
  }, []);

  const activeGenerations = TABS
    .filter((tab) => generationCounts[tab.id] > 0)
    .map((tab) => ({
      tabId: tab.id,
      label: tabLabel(tab.id),
      count: generationCounts[tab.id],
    }));

  // Popstate event listener to sync tab state with URL on back/forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname;
      // Strip the locale root prefix (if any) before reading the
      // /studio/<tab> segment, so this works for both /studio/<tab> and
      // /<locale>/studio/<tab>.
      const { rootPath } = getLocaleConfig(locale);
      const localeAwarePath = rootPath && path.startsWith(rootPath) ? path.slice(rootPath.length) : path;
      const segments = localeAwarePath.split('/').filter(Boolean);
      const tabId = segments[1] || 'image';
      if (TABS.find(t => t.id === tabId)) {
        setActiveTab(tabId);
      }
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [locale]);

  const handleTabChange = useCallback((tabId) => {
    window.history.pushState(null, '', studioPath(tabId));
    setActiveTab(tabId);
  }, [studioPath]);

  const handleOpenNotification = useCallback((notification) => {
    handleTabChange(notification.tabId);
    dismissNotification(notification.id);
  }, [dismissNotification, handleTabChange]);

  const handleTabClick = (e, tabId) => {
    if (e.button === 0 && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      handleTabChange(tabId);
      return true;
    }
    return false;
  };

  const handleNavigationItemClick = (event, tabId) => {
    if (handleTabClick(event, tabId)) {
      setIsMobileOpen(false);
    }
  };

  // Auto-hide header when inside a specific workflow view or design agent
  useEffect(() => {
    const isEditingWorkflow = (activeTab === 'workflows' || !!idFromParams) && urlWorkflowId;
    const isDesignAgent = activeTab === 'design-agent';
    
    if (isEditingWorkflow || isDesignAgent) {
      setIsHeaderVisible(false);
    } else {
      setIsHeaderVisible(true);
    }
  }, [activeTab, urlWorkflowId, idFromParams]);

  // Global builder CSS cleanup when switching away from Workflows or Design Agent tabs
  useEffect(() => {
    const fromBuilder = sessionStorage.getItem("fromWorkflowBuilder");
    const fromDesignAgent = sessionStorage.getItem("fromDesignAgent");
    
    if ((fromBuilder && activeTab !== 'workflows') || (fromDesignAgent && activeTab !== 'design-agent')) {
      sessionStorage.removeItem("fromWorkflowBuilder");
      sessionStorage.removeItem("fromDesignAgent");
      window.location.reload();
    }
  }, [activeTab]);

  useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      fetchBalance(stored);
      // Sync cookie immediately on mount to establish identity for background requests
      document.cookie = `muapi_key=${stored}; path=/; max-age=31536000; SameSite=Lax`;
    }
  }, [fetchBalance]);

  const handleKeySave = useCallback((key) => {
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
    fetchBalance(key);
    document.cookie = `muapi_key=${key}; path=/; max-age=31536000; SameSite=Lax`;
  }, [fetchBalance]);

  const handleKeyChange = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
    setBalance(null);
    document.cookie = "muapi_key=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  }, []);

  // Inject API key into all outgoing Axios requests (prop-based approach)
  // We use an interceptor to be selective and NOT send the key to external domains like S3
  useEffect(() => {
    // Safety: Clear any global defaults that might have been set previously
    delete axios.defaults.headers.common['x-api-key'];

    if (!apiKey) return;

    const interceptorId = axios.interceptors.request.use((config) => {
      // Check if URL is local/proxied
      const isRelative = config.url.startsWith('/') || !config.url.startsWith('http');
      const isInternalProxy = config.url.includes('/api/app') || config.url.includes('/api/workflow') || config.url.includes('/api/agents') || config.url.includes('/api/api') || config.url.includes('/api/v1');

      if (isRelative || isInternalProxy) {
        config.headers['x-api-key'] = apiKey;
      }
      
      return config;
    });

    return () => {
      axios.interceptors.request.eject(interceptorId);
    };
  }, [apiKey]);

  // Poll for balance every 30 seconds if key is present
  useEffect(() => {
    if (!apiKey) return;
    const interval = setInterval(() => fetchBalance(apiKey), 30000);
    return () => clearInterval(interval);
  }, [apiKey, fetchBalance]);

  // Drag and Drop Handlers
  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const isFileDrag = e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files');
    if (isFileDrag && e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set to false if we're leaving the container itself, not moving between children
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      setDroppedFiles(files);
    }
  }, []);

  const handleFilesHandled = useCallback(() => {
    setDroppedFiles(null);
  }, []);

  if (!hasMounted) return (
    <div className="bg-canvas flex min-h-screen items-center justify-center">
      <Spinner className="size-8 text-brand" />
    </div>
  );

  return (
    <div 
      className="relative flex h-screen flex-col overflow-hidden bg-base text-ink"
      onDragOver={handleDragOver}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* 背景氛围流光动效 (根据后台动效配置开关) */}
      {motionConfig.ambientGlow && (
        <div className="pointer-events-none absolute -top-40 left-1/2 z-0 h-80 w-full max-w-4xl -translate-x-1/2 bg-gradient-to-b from-brand-soft to-transparent opacity-60 blur-3xl" />
      )}
      {/* Drag Overlay */}
      {isDragging && (
        <div className="pointer-events-none fixed inset-0 z-toast flex items-center justify-center border-4 border-dashed border-brand-ring bg-brand-soft backdrop-blur-md transition-opacity duration-slow">
          <div className="flex scale-110 animate-pulse flex-col items-center gap-4 rounded-3xl border border-line bg-overlay p-8 shadow-elevation-4">
            <div className="flex size-20 items-center justify-center rounded-2xl bg-brand text-ink-on-accent">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12"/>
              </svg>
            </div>
            <div className="flex flex-col items-center">
              <span className="text-page-title font-bold text-ink">{copy.shell.dropHere}</span>
              <span className="text-body-sm text-ink-subtle">{copy.shell.dropHereHint}</span>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      {isHeaderVisible && (
        <header className="bg-surface-glass z-header flex h-14 shrink-0 items-center justify-between gap-4 border-b border-line-subtle px-4 backdrop-blur-md">
          {/* Left: Mobile menu toggle + Logo + Desktop Sidebar Toggle */}
          <div className="flex items-center gap-3">
            {/* Mobile drawer toggle */}
            <IconButton
              icon={Menu}
              onClick={() => setIsMobileOpen(!isMobileOpen)}
              className="md:hidden"
              label={copy.shell.toggleNavMenu}
            />

            {/* Desktop Sidebar Toggle Button (Single Toggle Button) */}
            <div className="group relative hidden md:block">
              <IconButton
                icon={PanelLeft}
                onClick={toggleSidebar}
                label={isSidebarCollapsed ? copy.shell.expandSidebar : copy.shell.collapseSidebar}
                className={isSidebarCollapsed ? '[&_svg]:rotate-180' : undefined}
              />
              {/* Custom Tooltip */}
              <div className="text-caption bg-overlay-glass z-tooltip pointer-events-none absolute left-0 top-full mt-2 whitespace-nowrap rounded-md border border-line-strong px-2.5 py-1 font-medium text-ink opacity-0 shadow-elevation-3 backdrop-blur-md transition-opacity duration-base group-hover:opacity-100">
                {isSidebarCollapsed ? copy.shell.expandSidebar : copy.shell.collapseSidebar}
              </div>
            </div>

            {/* Logo & Title (动态品牌与Logo) */}
            <a
              href={siteBrand?.logoHref || '/studio'}
              target={siteBrand?.logoTarget || '_self'}
              className="group flex items-center gap-2.5 cursor-pointer"
              aria-label={siteBrand?.brandName || copy.shell.brand}
            >
              {siteBrand?.logoUrl && !logoImgError ? (
                <div className="flex h-8 max-w-44 items-center justify-center transition-transform duration-base group-hover:scale-105">
                  <img
                    src={siteBrand.logoUrl}
                    alt={siteBrand.brandName || 'Logo'}
                    className="max-h-8 w-auto max-w-44 object-contain"
                    onError={() => setLogoImgError(true)}
                  />
                </div>
              ) : (
                /* The brand tile is admin data, so an override colour is
                   allowed to win; the fallback resolves from --accent-primary
                   through `text-ink-on-accent` / `bg-brand` rather than a
                   second copy of the hex. */
                <div
                  className="bg-brand text-ink-on-accent flex size-8 items-center justify-center rounded-lg shadow-elevation-1 transition-transform duration-base group-hover:scale-105"
                  style={siteBrand?.logoBgColor ? { backgroundColor: siteBrand.logoBgColor } : undefined}
                >
                  <DynamicVectorIcon
                    iconName={siteBrand?.logoIcon || 'layers'}
                    color={siteBrand?.logoTextColor || undefined}
                    className="size-5"
                  />
                </div>
              )}

              {siteBrand?.showBrandName && (
                <span className="font-jost text-body hidden max-w-44 truncate font-bold tracking-tight text-ink sm:block">
                  {siteBrand?.brandName || copy.shell.brand}
                </span>
              )}
            </a>

            {/* 左侧全站固定纯文字导航 (首页 + 社区) */}
            <nav className="ml-1 flex items-center gap-1 sm:ml-4 sm:gap-2" aria-label={copy.shell.studioNavigation}>
              {/* Hidden below `sm`: the logo tile beside it already links to
                  /studio, and at 390px the duplicate label is what pushed the
                  Log in control past the viewport edge. */}
              <a
                href={studioPath('')}
                className={`text-body-sm hidden rounded-md px-2.5 py-1 transition-colors sm:text-body sm:block ${
                  pathname === '/' || pathname?.includes('/studio')
                    ? 'font-semibold text-ink'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {copy.shell?.home || (isZh ? '首页' : 'Studio')}
              </a>
              <a
                href="/community"
                className={`text-body-sm rounded-md px-2.5 py-1 transition-colors sm:text-body ${
                  pathname?.startsWith('/community')
                    ? 'font-semibold text-ink'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {isZh ? '社区' : 'Community'}
              </a>
            </nav>
          </div>

          {/* Active Tab Breadcrumb Badge */}
          <div className="bg-wash text-caption hidden items-center gap-2 rounded-full border border-line-subtle px-3 py-1 text-ink-muted lg:flex">
            <span className="size-1.5 rounded-full bg-brand" />
            <span className="font-medium text-ink">
              {tabLabel(activeTab) || copy.shell.studioFallback}
            </span>
          </div>

          {/* Right: Actions (右上角固定图标功能区: 额度、提醒、语言切换、用户头像) */}
          <div className="flex-shrink-0 flex items-center gap-2">
            <UserDropdownMenu
              user={accountUser}
              credits={accountCredits}
              locale={locale}
              onOpenSettings={() => {
                setAccountModalTab('settings');
                setIsAccountModalOpen(true);
              }}
              onOpenAccount={(tab) => {
                setAccountModalTab(tab);
                setIsAccountModalOpen(true);
              }}
              onLogout={handleLogout}
              onOpenAuth={() => setShowAuthModal(true)}
            />
          </div>
        </header>
      )}

      {/* Main Body Layout: Left Sidebar + Studio Content Area */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Mobile Backdrop Overlay */}
        {isMobileOpen && (
          <div 
            className="bg-scrim z-sticky animate-fade-in fixed inset-0 backdrop-blur-sm md:hidden"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        {/* Left Sidebar Navigation */}
        {isHeaderVisible && (
          <aside
            className={`
              bg-surface-glass z-drawer fixed bottom-0 left-0 top-14 flex shrink-0 select-none flex-col border-r border-line-subtle backdrop-blur-md transition-[transform,width] duration-slow ease-standard md:static md:h-full
              ${isMobileOpen ? 'w-sidebar translate-x-0' : '-translate-x-full md:translate-x-0'}
              ${isSidebarCollapsed ? 'md:w-sidebar-collapsed' : 'md:w-sidebar'}
            `}
          >
            <nav aria-label={copy.shell.studioNavigation} className="flex-1 overflow-x-hidden overflow-y-auto px-2 py-2">
              <div className="space-y-1">
                {NAVIGATION_CATEGORIES.map((category) => {
                  const isCategoryActive = activeCategory?.id === category.id;
                  const isCollapsed = isSidebarCollapsed && !isMobileOpen;
                  const isCategoryOpen = !isCollapsed && expandedCategoryId === category.id;
                  const categoryPanelId = `navigation-category-${category.id}`;
                  const categoryLabelText = categoryLabel(category.id);

                  return (
                    <div key={category.id} className="relative">
                      <button
                        type="button"
                        onClick={() => handleCategoryToggle(category.id)}
                        aria-label={categoryLabelText}
                        aria-expanded={isCategoryOpen}
                        aria-controls={isCollapsed ? undefined : categoryPanelId}
                        title={isCollapsed ? categoryLabelText : undefined}
                        className={`
                          group relative flex items-center rounded-xl border font-semibold transition-colors duration-fast
                          ${isCollapsed ? 'mx-auto h-11 w-11 justify-center' : 'min-h-11 w-full gap-3 px-3 py-2.5 text-left'}
                          ${isCategoryActive
                            ? 'border-brand-line bg-brand-soft text-brand'
                            : isCategoryOpen
                              ? 'border-line bg-wash-strong text-ink'
                              : 'border-transparent text-ink-muted hover:bg-wash hover:text-ink'
                          }
                        `}
                      >
                        {isCategoryActive && (
                          <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-brand" />
                        )}

                        <span className={`shrink-0 transition-colors ${isCategoryActive ? 'text-brand' : 'text-ink-muted group-hover:text-ink'}`}>
                          {category.icon}
                        </span>

                        {!isCollapsed && (
                          <>
                            <span className="text-label min-w-0 flex-1">
                              {categoryLabelText}
                            </span>
                            <ChevronDown
                              className={`size-4 shrink-0 transition-transform duration-base ${isCategoryOpen ? 'rotate-180' : ''}`}
                              strokeWidth={1.8}
                              aria-hidden="true"
                            />
                          </>
                        )}
                      </button>

                      {!isCollapsed && isCategoryOpen && (
                        <div
                          id={categoryPanelId}
                          role="group"
                          aria-label={`${categoryLabelText} ${copy.shell.toolsSuffix}`}
                          className="ml-2 mt-1 max-h-64 space-y-1 overflow-y-auto border-l border-line pl-2"
                        >
                          {category.tabIds.map((tabId) => {
                            const tab = TABS.find((item) => item.id === tabId);
                            if (!tab) return null;
                            const isActive = activeTab === tab.id;

                            return (
                              <a
                                key={tab.id}
                                href={studioPath(tab.id)}
                                onClick={(event) => handleNavigationItemClick(event, tab.id)}
                                aria-current={isActive ? 'page' : undefined}
                                className={`
                                  group relative flex items-center gap-2.5 rounded-lg border px-2.5 py-2 text-label font-medium transition-colors duration-fast
                                  ${isActive
                                    ? 'border-brand-line bg-brand-soft text-brand'
                                    : 'border-transparent text-ink-muted hover:bg-wash hover:text-ink'
                                  }
                                `}
                              >
                                {isActive && (
                                  <span className="absolute -left-2.5 bottom-2 top-2 w-0.5 rounded-full bg-brand" />
                                )}
                                <span className={`shrink-0 ${isActive ? 'text-brand' : 'text-ink-subtle group-hover:text-ink-muted'}`}>
                                  {tab.icon}
                                </span>
                                <span className="truncate">{tabLabel(tab.id)}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {showExploreApps && EXPLORE_APPS_TAB && (
                <div className="mt-3 border-t border-line-subtle pt-3">
                  <a
                    href={studioPath(EXPLORE_APPS_TAB.id)}
                    onClick={(event) => handleNavigationItemClick(event, EXPLORE_APPS_TAB.id)}
                    aria-current={activeTab === EXPLORE_APPS_TAB.id ? 'page' : undefined}
                    aria-label={tabLabel(EXPLORE_APPS_TAB.id)}
                    title={isSidebarCollapsed && !isMobileOpen ? tabLabel(EXPLORE_APPS_TAB.id) : undefined}
                    className={`
                      group relative flex items-center rounded-xl border text-body-sm font-semibold transition-colors duration-fast
                      ${isSidebarCollapsed && !isMobileOpen ? 'mx-auto h-11 w-11 justify-center' : 'w-full gap-3 px-3 py-2.5'}
                      ${activeTab === EXPLORE_APPS_TAB.id
                        ? 'border-brand-line bg-brand-soft text-brand'
                        : 'border-transparent text-ink-muted hover:bg-wash hover:text-ink'
                      }
                    `}
                  >
                    {activeTab === EXPLORE_APPS_TAB.id && (
                      <span className="absolute bottom-2 left-0 top-2 w-1 rounded-r-full bg-brand" />
                    )}
                    <span className={`shrink-0 ${activeTab === EXPLORE_APPS_TAB.id ? 'text-brand' : 'text-ink-muted group-hover:text-ink'}`}>
                      {EXPLORE_APPS_TAB.icon}
                    </span>
                    {(!isSidebarCollapsed || isMobileOpen) && (
                      <span className="truncate">{tabLabel(EXPLORE_APPS_TAB.id)}</span>
                    )}
                  </a>
                </div>
              )}
            </nav>
          </aside>
        )}

        {/* Studio Content */}
        <div className="relative h-full min-h-0 flex-1 overflow-hidden bg-base" data-active-studio={activeTab}>
          {modelDirectoryState === 'error' && (
            <div
              className="absolute inset-x-4 top-4 z-40 mx-auto flex max-w-lg items-center gap-3 rounded-lg border border-warning-line bg-warning-soft px-4 py-2.5 shadow-elevation-4"
              role="alert"
            >
              <AlertCircle className="size-4 shrink-0 text-warning" />
              <span className="flex-1 text-body-sm text-ink">{copy.shell.modelDirectoryUnavailable}</span>
              <button
                type="button"
                onClick={() => setStudioConfigAttempt((n) => n + 1)}
                className="h-control-md shrink-0 rounded-lg border border-warning-line px-3 text-label font-semibold text-warning transition-colors duration-base hover:bg-warning-soft active:scale-95"
              >
                {copy.shell.retry}
              </button>
            </div>
          )}
        {activeTab === 'image' && (
            <StudioResourceBoundary studioId="image">
          <ImageStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('image')} onGenerationEnd={makeGenerationEndCallback('image')} onGenerationComplete={makeSuccessCallback('image')} onGenerationError={makeErrorCallback('image')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'headshot' && (
            <StudioResourceBoundary studioId="headshot">
          <HeadshotStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('headshot')} onGenerationEnd={makeGenerationEndCallback('headshot')} onGenerationComplete={makeSuccessCallback('headshot')} onGenerationError={makeErrorCallback('headshot')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'layers' && (
            <StudioResourceBoundary studioId="layers">
          <LayersStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('layers')} onGenerationEnd={makeGenerationEndCallback('layers')} onGenerationComplete={makeSuccessCallback('layers')} onGenerationError={makeErrorCallback('layers')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'video' && (
            <StudioResourceBoundary studioId="video">
          <VideoStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('video')} onGenerationEnd={makeGenerationEndCallback('video')} onGenerationComplete={makeSuccessCallback('video')} onGenerationError={makeErrorCallback('video')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'clipping' && (
            <StudioResourceBoundary studioId="clipping">
          <ClippingStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('clipping')} onGenerationEnd={makeGenerationEndCallback('clipping')} onGenerationComplete={makeSuccessCallback('clipping')} onGenerationError={makeErrorCallback('clipping')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'motion-control' && (
            <StudioResourceBoundary studioId="motion-control">
          <MotionControlStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('motion-control')} onGenerationEnd={makeGenerationEndCallback('motion-control')} onGenerationComplete={makeSuccessCallback('motion-control')} onGenerationError={makeErrorCallback('motion-control')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'vibe-motion' && (
            <StudioResourceBoundary studioId="vibe-motion">
          <VibeMotionStudio apiKey={apiKey} locale={locale} onGenerationStart={makeGenerationStartCallback('vibe-motion')} onGenerationEnd={makeGenerationEndCallback('vibe-motion')} onGenerationComplete={makeSuccessCallback('vibe-motion')} onGenerationError={makeErrorCallback('vibe-motion')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'lipsync' && (
            <StudioResourceBoundary studioId="lipsync">
          <LipSyncStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('lipsync')} onGenerationEnd={makeGenerationEndCallback('lipsync')} onGenerationComplete={makeSuccessCallback('lipsync')} onGenerationError={makeErrorCallback('lipsync')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'body-swap' && (
            <StudioResourceBoundary studioId="body-swap">
          <RecastStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('body-swap')} onGenerationEnd={makeGenerationEndCallback('body-swap')} onGenerationComplete={makeSuccessCallback('body-swap')} onGenerationError={makeErrorCallback('body-swap')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'cinema' && (
            <StudioResourceBoundary studioId="cinema">
          <CinemaStudio apiKey={apiKey} locale={locale} onGenerationStart={makeGenerationStartCallback('cinema')} onGenerationEnd={makeGenerationEndCallback('cinema')} onGenerationComplete={makeSuccessCallback('cinema')} onGenerationError={makeErrorCallback('cinema')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'audio' && (
            <StudioResourceBoundary studioId="audio">
          <AudioStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('audio')} onGenerationEnd={makeGenerationEndCallback('audio')} onGenerationComplete={makeSuccessCallback('audio')} onGenerationError={makeErrorCallback('audio')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'marketing' && (
            <StudioResourceBoundary studioId="marketing">
          <MarketingStudio apiKey={apiKey} locale={locale} droppedFiles={droppedFiles} onFilesHandled={handleFilesHandled} onGenerationStart={makeGenerationStartCallback('marketing')} onGenerationEnd={makeGenerationEndCallback('marketing')} onGenerationComplete={makeSuccessCallback('marketing')} onGenerationError={makeErrorCallback('marketing')} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'workflows' && (
            <StudioResourceBoundary studioId="workflows">
          <WorkflowStudio
            apiKey={apiKey}
            signedIn={!!accountUser}
            onRequireAuth={() => setShowAuthModal(true)}
            isHeaderVisible={isHeaderVisible}
            onToggleHeader={setIsHeaderVisible}
            onGenerationStart={makeGenerationStartCallback('workflows')}
            onGenerationEnd={makeGenerationEndCallback('workflows')}
            onGenerationComplete={makeSuccessCallback('workflows')}
            onGenerationError={makeErrorCallback('workflows')}
          />
            </StudioResourceBoundary>
          )}
        {activeTab === 'agents' && (
            <StudioResourceBoundary studioId="agents">
          <AgentStudio apiKey={apiKey} locale={locale} signedIn={!!accountUser} onRequireAuth={() => setShowAuthModal(true)} isHeaderVisible={isHeaderVisible} onToggleHeader={setIsHeaderVisible} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'design-agent' && (
            <StudioResourceBoundary studioId="design-agent">

            <DesignAgentStudio
              apiKey={apiKey}
              locale={locale}
              signedIn={!!accountUser}
              authChecked={accountChecked}
              onRequireAuth={() => setShowAuthModal(true)}
              isHeaderVisible={isHeaderVisible}
              onToggleHeader={setIsHeaderVisible}
              onGenerationStart={makeGenerationStartCallback('design-agent')}
              onGenerationEnd={makeGenerationEndCallback('design-agent')}
              onGenerationComplete={makeSuccessCallback('design-agent')}
              onGenerationError={makeErrorCallback('design-agent')}
            />
          
            </StudioResourceBoundary>
          )}
        {activeTab === 'apps' && (
            <StudioResourceBoundary studioId="apps">
          <AppsStudio apiKey={apiKey} locale={locale} />
            </StudioResourceBoundary>
          )}
        {activeTab === 'ai-influencer' && (
            <StudioResourceBoundary studioId="ai-influencer">
          <AiInfluencerStudio
            apiKey={apiKey}
            locale={locale}
            onGenerationStart={makeGenerationStartCallback('ai-influencer')}
            onGenerationEnd={makeGenerationEndCallback('ai-influencer')}
            onGenerationComplete={makeSuccessCallback('ai-influencer')}
            onGenerationError={makeErrorCallback('ai-influencer')}
          />
            </StudioResourceBoundary>
          )}
      </div>
    </div>

      {/* Global generation activity and notification stack */}
      {(activeGenerations.length > 0 || notifications.length > 0) && (
        <div
          aria-live="polite"
          aria-label={copy.notifications.ariaLabel}
          className="z-toast pointer-events-none fixed bottom-5 left-5 right-5 top-16 flex flex-col gap-2 overflow-x-hidden overflow-y-auto md:left-auto md:w-toast"
          data-testid="global-notification-stack"
        >
          {activeGenerations.map((generation) => (
            <div
              key={generation.tabId}
              role="status"
              data-generation-tab={generation.tabId}
              className="bg-surface-inverse text-ink-inverse animate-fade-in pointer-events-auto flex items-center gap-3 rounded-xl border border-brand-line px-3.5 py-3 text-body-sm shadow-elevation-3"
              data-testid="generation-activity"
            >
              <span className="border-brand-line flex size-8 shrink-0 items-center justify-center rounded-lg border bg-brand-soft">
                <Spinner className="size-3.5 text-brand" />
              </span>
              <p className="min-w-0 flex-1 font-semibold">
                {generation.label} {copy.notifications.generating}
                {generation.count > 1 ? ` (${generation.count})` : ''}
              </p>
            </div>
          ))}

          {notifications.map((notif) => (
            <div
              key={notif.id}
              role={notif.type === 'error' ? 'alert' : 'status'}
              data-notification-type={notif.type}
              data-notification-tab={notif.tabId}
              className={`
                text-ink animate-fade-in pointer-events-auto flex items-start gap-3 rounded-xl border bg-overlay px-3.5 py-3 text-body-sm shadow-elevation-3
                ${notif.type === 'success' ? 'border-brand-line' : 'border-danger-line'}
              `}
            >
              <span
                className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border ${
                  notif.type === 'success'
                    ? 'border-brand-line bg-brand-soft text-brand'
                    : 'border-danger-line bg-danger-soft text-danger'
                }`}
              >
                {notif.type === 'success' ? (
                  <Check className="size-4" strokeWidth={2} aria-hidden="true" />
                ) : (
                  <AlertCircle className="size-4" strokeWidth={1.8} aria-hidden="true" />
                )}
              </span>

              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {notif.label}
                  <span className="font-normal text-ink-subtle">
                    {' '}
                    {notif.type === 'success' ? copy.notifications.generationComplete : copy.notifications.generationFailed}
                  </span>
                </p>
                {notif.type === 'error' && notif.message && (
                  <p className="text-label mt-0.5 line-clamp-2 font-medium text-danger" title={typeof notif.message === 'string' ? notif.message : String(notif.message?.message || notif.message)}>
                    {typeof notif.message === 'string' ? notif.message : String(notif.message?.message || notif.message)}
                  </p>
                )}
                {notif.type === 'success' && (
                  <p className="text-label mt-0.5 text-ink-subtle">
                    {copy.notifications.resultReady}
                  </p>
                )}
                {notif.type === 'success' && (
                  <button
                    type="button"
                    onClick={() => handleOpenNotification(notif)}
                    className="text-caption mt-1.5 font-bold text-brand transition-colors hover:text-brand-hover"
                    aria-label={copy.notifications.openResult.replace('{label}', notif.label)}
                  >
                    {copy.notifications.open}
                  </button>
                )}
              </div>

              <IconButton
                icon={X}
                size="icon-sm"
                onClick={() => dismissNotification(notif.id)}
                label={copy.notifications.dismissNotification}
                className="mt-0.5 shrink-0"
              />
            </div>
          ))}
        </div>
      )}

      {/* Settings Modal */}
      <Modal open={showSettings} onOpenChange={setShowSettings}>
        <ModalContent
          size="sm"
          title={copy.settingsModal.title}
          description={copy.settingsModal.subtitle}
        >
          <div className="space-y-3">
            <div className="rounded-lg border border-line bg-wash p-4">
              <p className="text-label text-ink-subtle">
                {copy.settingsModal.activeApiKey}
              </p>
              <p className="text-mono mt-1.5 text-ink">
                {apiKey
                  ? `${apiKey.slice(0, 8)}••••••••••••••••`
                  : copy.shell.apiKeyUnconfigured}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-lg border border-line bg-wash p-4">
              <div className="min-w-0">
                <p className="text-label text-ink-subtle">
                  {copy.settingsModal.interfaceLanguage}
                </p>
                <p className="text-body-sm mt-1 text-ink">{nativeLocaleName}</p>
              </div>
              <LanguageSwitcher showLabel={false} />
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <Button variant="danger" fullWidth onClick={handleKeyChange}>
              {copy.settingsModal.changeKey}
            </Button>
            <Button
              variant="secondary"
              fullWidth
              onClick={() => setShowSettings(false)}
            >
              {copy.settingsModal.close}
            </Button>
          </div>
        </ModalContent>
      </Modal>

      {/* 登录拦截与登录弹窗 */}
      {showAuthModal && (
        <AuthModal
          onSuccess={handleAuthSuccess}
          onClose={handleAuthClose}
          locale={locale}
        />
      )}

      {/* 个人中心悬浮窗（点击背景当前页面即可关闭） */}
      <AccountModal
        isOpen={isAccountModalOpen}
        onClose={handleCloseAccountModal}
        initialTab={accountModalTab}
      />
    </div>
  );
}
