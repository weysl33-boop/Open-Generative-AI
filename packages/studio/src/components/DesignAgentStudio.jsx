"use client";

import { useState, useEffect } from 'react';
import { CreativeCanvas } from 'design-agent';

import { getUserBalance } from '../muapi';
import { resolveCopy } from '../i18nUtils';
import en from '../messages/en/designAgentStudio.json';
import zh from '../messages/zh/designAgentStudio.json';
import ja from '../messages/ja-JP/designAgentStudio.json';
import ko from '../messages/ko-KR/designAgentStudio.json';
import zhTw from '../messages/zh-TW/designAgentStudio.json';
import es from '../messages/es/designAgentStudio.json';

export default function DesignAgentStudio({
  apiKey,
  userEmail,
  balance,
  locale = 'en',
  signedIn = false,
  authChecked = true,
  onRequireAuth,
  isHeaderVisible,
  onToggleHeader,
  onGenerationStart,
  onGenerationEnd,
  onGenerationComplete,
  onGenerationError,
}) {
  const copy = resolveCopy(en, { 'zh-CN': zh, 'ja-JP': ja, 'ko-KR': ko, 'zh-TW': zhTw, es }, locale);
  const [userData, setUserData] = useState(null);

  // Written synchronously during render (not inside an effect below) so it's already in
  // localStorage before CreativeCanvas's own mount effects read it — passive effects run
  // child-before-parent within a commit, so setting this from *our* useEffect ran after
  // CreativeCanvas's first sessions/agent-skills fetch had already gone out unauthenticated.
  if (typeof window !== 'undefined' && apiKey) {
    sessionStorage.setItem("fromDesignAgent", "true");
    localStorage.setItem("token", apiKey);
  }

  useEffect(() => {
    if (!apiKey) return undefined;
    return () => sessionStorage.removeItem("fromDesignAgent");
  }, [apiKey]);

  useEffect(() => {
    if (!apiKey) return;

    // White-label shells already know the end user's identity/credit balance (fetched via
    // /api/whitelabel/balance) and pass them in directly — GET /account/balance explicitly
    // 403s for white-label end users, so getUserBalance() below must stay BYOK-only.
    if (userEmail !== undefined || balance !== undefined) {
      setUserData({
        username: userEmail?.split('@')[0] || 'Studio User',
        email: userEmail,
        balance: balance || 0,
      });
      return;
    }

    const fetchUser = async () => {
      try {
        const data = await getUserBalance(apiKey);
        setUserData({
          username: data.email?.split('@')[0] || 'Studio User',
          email: data.email,
          balance: data.balance || 0
        });
      } catch (err) {
        console.error('Failed to fetch user data for Design Agent:', err);
      }
    };

    fetchUser();
  }, [apiKey, userEmail, balance]);

  // /api/v1/creative-agent/sessions 与 /agent-skills 按账号会话 cookie 鉴权。未登录时挂载
  // CreativeCanvas 会立刻发出这两个请求并各自 401，用户看到的是一个永远打不开的画布加一串
  // 未捕获的 console 错误，而不是"请先登录"。authChecked 未就绪时先转圈，避免已登录用户
  // 在 /api/auth/me 往返期间闪一下登录引导。
  if (!signedIn && authChecked) {
    return (
      <div className="h-full w-full bg-canvas overflow-hidden design-agent-studio flex flex-col items-center justify-center text-ink-subtle gap-4 px-6 text-center">
        <svg width="60" height="60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="0.5">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
          <circle cx="12" cy="7" r="4" />
        </svg>
        <p className="text-micro font-black uppercase">{copy.auth.heading}</p>
        <p className="text-caption max-w-sm">{copy.auth.description}</p>
        <button
          type="button"
          onClick={onRequireAuth}
          className="text-micro text-brand hover:text-ink border border-line-subtle hover:border-line-strong px-4 py-2 rounded-lg transition-colors"
        >
          {copy.auth.cta}
        </button>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="h-full w-full bg-canvas overflow-hidden design-agent-studio flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-line-subtle border-t-brand rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-canvas overflow-hidden design-agent-studio">
      <CreativeCanvas 
        user={userData}
        isAuthorized={!!userData}
        creditConversionRate={200}
        theme="dark"
        onToggleHeader={onToggleHeader}
        isHeaderVisible={isHeaderVisible}
        onGenerationStart={onGenerationStart}
        onGenerationEnd={onGenerationEnd}
        onGenerationComplete={onGenerationComplete}
        onGenerationError={onGenerationError}
      />
    </div>
  );
}
