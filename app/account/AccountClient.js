'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { X, User, Loader2 } from 'lucide-react';
import AccountLayout from '@/components/account/AccountLayout';
import ActivityTab from '@/components/account/tabs/ActivityTab';
import PriceDetailsTab from '@/components/account/tabs/PriceDetailsTab';
import MembershipTab from '@/components/account/tabs/MembershipTab';
import AgentApiKeyTab from '@/components/account/tabs/AgentApiKeyTab';
import SettingsTab from '@/components/account/tabs/SettingsTab';
import InvoicesTab from '@/components/account/tabs/InvoicesTab';
import WalletTab from '@/components/account/tabs/WalletTab';
import ProfileTab from '@/components/account/tabs/ProfileTab';
import UsageTab from '@/components/account/tabs/UsageTab';
import AuthModal from '@/components/AuthModal';
import { Button } from '@/components/ui/button';

function AccountContent({ onClose, initialTabProp, onTabChange: onTabChangeProp }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialAction = initialTabProp || searchParams?.get('action') || 'activity';

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [credits, setCredits] = useState(0);
  const [points, setPoints] = useState(0);
  const [currentTab, setCurrentTab] = useState(initialAction);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileBio, setProfileBio] = useState('');
  const [profileCountry, setProfileCountry] = useState('');
  const [profileGender, setProfileGender] = useState('');
  const lastInitialTabRef = React.useRef(initialTabProp);


  const loadAccount = async () => {
    try {
      setAuthLoading(true);
      const response = await fetch('/api/auth/me', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setUser(data.user);
          setCredits(data.entitlements?.credits ?? data.user.credits ?? 0);
          if (data.entitlements?.creditBuckets) {
            setPoints(data.entitlements.creditBuckets.gift ?? data.entitlements.creditBuckets.promotional ?? 0);
          }
          setProfileName(data.user.displayName || data.user.display_name || data.user.name || '');
          setProfileBio(data.user.bio || '');
          setProfileCountry(data.user.country || '');
          setProfileGender(data.user.gender || '');
          return;
        }
      }
      setUser(null);
    } catch {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    loadAccount();
  }, []);

  // 仅在外部传入的 initialTabProp 发生真实变化时更新当前 Tab，绝不可反向死锁覆盖用户的主动点击
  useEffect(() => {
    if (initialTabProp && initialTabProp !== lastInitialTabRef.current) {
      lastInitialTabRef.current = initialTabProp;
      setCurrentTab(initialTabProp);
    }
  }, [initialTabProp]);

  // 提示信息 3.5 秒后自动淡出
  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(''), 3500);
    return () => window.clearTimeout(timer);
  }, [message]);

  const handleTabChange = (tabId) => {
    lastInitialTabRef.current = tabId;
    setCurrentTab(tabId);
    onTabChangeProp?.(tabId);
    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.set('action', tabId);
        window.history.replaceState(null, '', url.toString());
      } catch {}
    }
  };

  const handleSaveProfile = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: profileName,
          bio: profileBio,
          country: profileCountry,
          gender: profileGender,
        }),
      });
      const data = await response.json();
      setMessage(response.ok ? '个人资料已更新' : data.error || '更新失败');
      if (response.ok) await loadAccount();
    } catch {
      setMessage('网络请求失败');
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    setMessage('正在安全退出并返回首页…');
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    if (typeof window !== 'undefined') {
      try {
        localStorage.removeItem('muapi_key');
        localStorage.removeItem('ko_user');
      } catch {}
      onClose?.();
      setTimeout(() => {
        window.location.href = '/';
      }, 250);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-base text-ink flex flex-col items-center justify-center p-6">
        <Loader2 className="size-8 animate-spin text-brand" />
        <p className="mt-3 text-xs text-ink-muted">正在加载个人账户信息…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-base text-ink flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md rounded-2xl border border-line bg-surface p-8 text-center shadow-elevation-4 backdrop-blur-xl">
          <div className="mx-auto flex size-14 items-center justify-center rounded-2xl border border-line bg-wash text-brand mb-4">
            <User className="size-7" />
          </div>
          <h2 className="text-xl font-bold text-ink">请先登录</h2>
          <p className="mt-2 text-sm text-ink-muted leading-relaxed">
            访问创作者个人中心、查看积分流水与任务消耗明细前，需要先登录你的账号。
          </p>
          <div className="mt-6 flex flex-col gap-3">
            <Button
              type="button"
              onClick={() => setShowAuthModal(true)}
              className="w-full h-10 rounded-xl bg-surface-inverse text-ink-on-accent font-semibold hover:bg-surface-inverse transition-all cursor-pointer"
            >
              立即登录 / 注册
            </Button>
            <Button
              asChild
              variant="outline"
              className="w-full h-10 rounded-xl border-line text-ink hover:bg-wash hover:text-ink"
            >
              <a href="/">返回首页</a>
            </Button>
          </div>
        </div>
        {showAuthModal && (
          <AuthModal
            isOpen={showAuthModal}
            onClose={() => setShowAuthModal(false)}
            onSuccess={() => {
              setShowAuthModal(false);
              loadAccount();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <>
      <AccountLayout
        user={user}
        activeTab={currentTab}
        onTabChange={handleTabChange}
        onLogout={logout}
        onClose={onClose}
      >
        {message && (
          <div
            role="status"
            className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-3 rounded-full border border-line-strong bg-overlay/95 px-5 py-2 text-xs font-medium text-ink shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-md animate-in fade-in slide-in-from-top-2"
          >
            <span>{message}</span>
            <button
              type="button"
              onClick={() => setMessage('')}
              className="text-ink-muted hover:text-ink transition-colors cursor-pointer"
              aria-label="关闭提示"
            >
              <X className="size-3.5" />
            </button>
          </div>
        )}

        {/* 创作活跃与偏好 (参考 Trae 活跃天数、AI 伙伴与模型偏好) */}
        {currentTab === 'activity' && <ActivityTab user={user} />}

        {/* 会员订阅与价格方案 */}
        {(currentTab === 'membership' || currentTab === 'subscription') && (
          <MembershipTab />
        )}

        {/* 价格详情 (模型价格表) */}
        {currentTab === 'price-details' && <PriceDetailsTab />}

        {/* 使用明细 (真实任务消耗记录与云端渲染流水) */}
        {currentTab === 'usage' && <UsageTab />}

        {/* 积分详情 */}
        {currentTab === 'points-details' && (
          <WalletTab
            credits={credits}
            points={points}
            planName={user?.role === 'admin' ? '管理特权' : '创作者计划'}
            onOpenRecharge={() => router.push('/pricing#credit-packs')}
            onOpenCheckIn={async () => {
              try {
                const res = await fetch('/api/financial/credits/checkin', { method: 'POST' });
                const data = await res.json();
                if (res.ok) {
                  setMessage(data.message || '签到成功，积分已入账！');
                  await loadAccount();
                } else {
                  setMessage(data.error || '今日已完成签到，请明日再来');
                }
              } catch {
                setMessage('网络连接异常，签到失败');
              }
            }}
          />
        )}

        {/* 编辑资料 */}
        {currentTab === 'edit-profile' && (
          <ProfileTab
            user={user}
            profileName={profileName}
            setProfileName={setProfileName}
            profileBio={profileBio}
            setProfileBio={setProfileBio}
            profileCountry={profileCountry}
            setProfileCountry={setProfileCountry}
            profileGender={profileGender}
            setProfileGender={setProfileGender}
            onSaveProfile={handleSaveProfile}
            onProfileUpdated={async (updatedUser) => {
              if (updatedUser) {
                setUser((prev) => ({ ...prev, ...updatedUser }));
              }
              await loadAccount();
            }}
            busy={busy}
          />
        )}

        {/* 设置 */}
        {currentTab === 'settings' && <SettingsTab />}

        {/* 订单发票 */}
        {currentTab === 'order-invoices' && <InvoicesTab />}

        {/* Agent API 密钥 */}
        {currentTab === 'agent-api-key' && <AgentApiKeyTab />}
      </AccountLayout>

    </>
  );
}

export default function AccountClient(props) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-base text-ink" />}>
      <AccountContent {...props} />
    </Suspense>
  );
}
