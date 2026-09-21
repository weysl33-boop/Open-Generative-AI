'use client';

import React, { useState, useEffect } from 'react';

const SUPPORTED_LANGUAGES = [
  { code: 'zh-CN', label: '简体中文' },
  { code: 'en', label: 'English' },
  { code: 'zh-TW', label: '繁體中文' },
  { code: 'ja-JP', label: '日本語' },
  { code: 'ko-KR', label: '한국어' },
  { code: 'es', label: 'Español' },
];

export default function SettingsTab() {
  const [notifications, setNotifications] = useState(true);
  const [highQualityPreview, setHighQualityPreview] = useState(true);
  const [currentLocale, setCurrentLocale] = useState('zh-CN');
  const [loading, setLoading] = useState(true);
  const [toastMessage, setToastMessage] = useState('');
  const [showLangDropdown, setShowLangDropdown] = useState(false);

  // 1. 从后端数据库加载真实偏好设置
  useEffect(() => {
    let mounted = true;
    async function loadPreferences() {
      try {
        const res = await fetch('/api/user/preferences');
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.preferences) {
            setNotifications(data.preferences.notifyOnComplete ?? true);
            setHighQualityPreview(data.preferences.highQualityPreview ?? true);
            setCurrentLocale(data.preferences.locale || 'zh-CN');
          }
        }
      } catch (err) {
        console.error('加载偏好设置失败:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    loadPreferences();
    return () => { mounted = false; };
  }, []);

  // 2. 实时保存偏好设置至数据库
  const savePreference = async (updates) => {
    try {
      const res = await fetch('/api/user/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (res.ok) {
        const data = await res.json();
        setToastMessage('偏好设置已同步至数据库');
        setTimeout(() => setToastMessage(''), 2500);
        return data;
      } else {
        setToastMessage('设置保存失败');
      }
    } catch {
      setToastMessage('网络连接异常');
    }
  };

  const handleToggleNotifications = () => {
    const nextVal = !notifications;
    setNotifications(nextVal);
    savePreference({ notifyOnComplete: nextVal });
  };

  const handleTogglePreview = () => {
    const nextVal = !highQualityPreview;
    setHighQualityPreview(nextVal);
    savePreference({ highQualityPreview: nextVal });
  };

  const handleSelectLanguage = async (code) => {
    setCurrentLocale(code);
    setShowLangDropdown(false);
    if (typeof document !== 'undefined') {
      document.cookie = `NEXT_LOCALE=${encodeURIComponent(code)}; path=/; max-age=31536000; SameSite=Lax`;
      document.cookie = `locale=${encodeURIComponent(code)}; path=/; max-age=31536000; SameSite=Lax`;
    }
    await savePreference({ locale: code });

    if (typeof window !== 'undefined') {
      const pathname = window.location.pathname || '/';
      const isStudio = pathname === '/' || pathname.includes('/studio');
      if (isStudio) {
        let cleanStudioPath = pathname;
        for (const prefix of ['/zh-CN', '/zh-TW', '/ja-JP', '/ko-KR', '/es', '/zh']) {
          if (cleanStudioPath === prefix || cleanStudioPath.startsWith(`${prefix}/`)) {
            cleanStudioPath = cleanStudioPath.slice(prefix.length) || '/';
            break;
          }
        }
        if (!cleanStudioPath.startsWith('/studio')) {
          cleanStudioPath = '/studio';
        }
        const targetRoot = code === 'zh-CN' ? '/zh' : code === 'ja-JP' ? '/ja-JP' : code === 'ko-KR' ? '/ko-KR' : code === 'zh-TW' ? '/zh-TW' : code === 'es' ? '/es' : '';
        const newUrl = targetRoot ? `${targetRoot}${cleanStudioPath}${window.location.search}` : `${cleanStudioPath}${window.location.search}`;
        window.location.href = newUrl;
      } else {
        window.location.reload();
      }
    }
  };

  const activeLangLabel = SUPPORTED_LANGUAGES.find(l => l.code === currentLocale)?.label || '简体中文';

  return (
    <div className="w-full flex flex-col h-full max-w-3xl mx-auto relative">
      {/* 实时保存轻量 Toast 反馈 */}
      {toastMessage && (
        <div className="fixed top-8 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full bg-overlay border border-line-strong text-xs text-ink shadow-elevation-4 backdrop-blur-md animate-in fade-in slide-in-from-top-2">
          {toastMessage}
        </div>
      )}

      <h3 className="text-xl font-bold text-ink text-center mb-6 tracking-tight">
        偏好设置
      </h3>

      <div className="flex flex-col gap-6">
        <div className="rounded-xl border border-line-subtle bg-raised p-6 flex flex-col gap-5">
          {/* 生成完成通知 */}
          <div className="flex items-center justify-between gap-4 border-b border-line-subtle pb-4 min-h-[54px]">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-ink">生成完成通知</h4>
              <p className="text-xs text-ink-muted mt-0.5 truncate">当长时间生图或视频任务渲染完成时发送系统推送</p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleToggleNotifications}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-base ease-in-out focus:outline-none ${
                notifications ? 'bg-surface-inverse' : 'bg-wash-press'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-canvas shadow-elevation-1 ring-0 transition duration-base ease-in-out ${
                  notifications ? 'translate-x-5' : 'translate-x-0 bg-white/80'
                }`}
              />
            </button>
          </div>

          {/* 高清实时画质预览 */}
          <div className="flex items-center justify-between gap-4 border-b border-line-subtle pb-4 min-h-[54px]">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-ink">高清实时画质预览</h4>
              <p className="text-xs text-ink-muted mt-0.5 truncate">在工作流中优先加载全分辨率渲染视图</p>
            </div>
            <button
              type="button"
              disabled={loading}
              onClick={handleTogglePreview}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-base ease-in-out focus:outline-none ${
                highQualityPreview ? 'bg-surface-inverse' : 'bg-wash-press'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-canvas shadow-elevation-1 ring-0 transition duration-base ease-in-out ${
                  highQualityPreview ? 'translate-x-5' : 'translate-x-0 bg-white/80'
                }`}
              />
            </button>
          </div>

          {/* 语言与国际化 */}
          <div className="flex items-center justify-between gap-4 min-h-[54px] relative">
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-medium text-ink">语言与国际化</h4>
              <p className="text-xs text-ink-muted mt-0.5 truncate">当前语言：{activeLangLabel} ({currentLocale})</p>
            </div>

            <div className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowLangDropdown(!showLangDropdown)}
                className="text-xs text-ink bg-wash-strong hover:bg-wash-press border border-line px-4 py-1.5 rounded-full font-medium transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <span>{activeLangLabel}</span>
                <span className="text-micro text-ink-muted">▼</span>
              </button>

              {showLangDropdown && (
                <div className="absolute right-0 bottom-full mb-2 w-32 rounded-xl border border-line bg-overlay shadow-elevation-3 py-1 z-50 text-xs animate-in fade-in">
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <button
                      key={lang.code}
                      type="button"
                      onClick={() => handleSelectLanguage(lang.code)}
                      className={`w-full px-3 py-2 text-start hover:bg-wash-press transition-colors flex items-center justify-between ${
                        currentLocale === lang.code ? 'text-ink font-bold' : 'text-ink-muted'
                      }`}
                    >
                      <span>{lang.label}</span>
                      {currentLocale === lang.code && <span>✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
