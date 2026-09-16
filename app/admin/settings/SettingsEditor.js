'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';

export default function SettingsEditor({ initialSettings }) {
  const [settings, setSettings] = useState(initialSettings || []);
  const [savingKey, setSavingKey] = useState(null);
  const [feedback, setFeedback] = useState({});

  const getVal = (key, fallback) => {
    const item = settings.find((s) => s.key === key);
    return item?.value !== undefined ? item.value : fallback;
  };

  const saveSetting = async (key, value, visibility = 'public') => {
    setSavingKey(key);
    setFeedback((prev) => ({ ...prev, [key]: '' }));

    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, value, visibility }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '保存失败');

      setFeedback((prev) => ({ ...prev, [key]: '已成功更新并留存审计' }));
      setTimeout(() => {
        setFeedback((prev) => ({ ...prev, [key]: '' }));
      }, 3000);
    } catch (err) {
      setFeedback((prev) => ({ ...prev, [key]: `错误: ${err.message}` }));
    } finally {
      setSavingKey(null);
    }
  };

  // 1. 全站公告横幅
  const banner = getVal('site_banner', { enabled: false, message: '', tone: 'info', dismissible: true });
  const [bannerEnabled, setBannerEnabled] = useState(Boolean(banner.enabled));
  const [bannerMsg, setBannerMsg] = useState(banner.message || '');
  const [bannerTone, setBannerTone] = useState(banner.tone || 'info');

  // 2. 注册开关
  const reg = getVal('registration_enabled', { enabled: true, allow_oauth: true });
  const [allowRegister, setAllowRegister] = useState(Boolean(reg.enabled));
  const [allowOauth, setAllowOauth] = useState(Boolean(reg.allow_oauth));

  // 3. 维护模式
  const maint = getVal('maintenance_mode', { enabled: false, message: '' });
  const [maintEnabled, setMaintEnabled] = useState(Boolean(maint.enabled));
  const [maintMsg, setMaintMsg] = useState(maint.message || '系统正在例行升级，请稍候访问');

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* 全站公告横幅 */}
      <Card>
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <h2 className="text-sm font-bold text-white">前台全站横幅公告 (Banner)</h2>
          <StatusBadge tone={bannerEnabled ? 'info' : 'neutral'}>
            {bannerEnabled ? '已开启前台展示' : '已关闭'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting('site_banner', {
              enabled: bannerEnabled,
              message: bannerMsg,
              tone: bannerTone,
              dismissible: true,
            });
          }}
          className="space-y-3.5"
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="banner_toggle"
              checked={bannerEnabled}
              onChange={(e) => setBannerEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="banner_toggle" className="text-xs text-white/80">
              启用前台顶部公告横幅
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1">公告文案内容</label>
            <input
              type="text"
              required
              value={bannerMsg}
              onChange={(e) => setBannerMsg(e.target.value)}
              placeholder="例如：系统已升级支持全新 Flux 与 Hailuo 视频生成模型！"
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1">展示色调风格</label>
            <select
              value={bannerTone}
              onChange={(e) => setBannerTone(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[#0a0a0a] px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
            >
              <option value="info">冰青 (信息通知)</option>
              <option value="good">翠绿 (新功能/福利)</option>
              <option value="warn">琥珀 (注意/提醒)</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-cyan-200">{feedback['site_banner']}</span>
            <button
              type="submit"
              disabled={savingKey === 'site_banner'}
              className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-200 disabled:opacity-50"
            >
              {savingKey === 'site_banner' ? '保存中…' : '保存公告配置'}
            </button>
          </div>
        </form>
      </Card>

      {/* 注册与第三方登录开关 */}
      <Card>
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <h2 className="text-sm font-bold text-white">用户注册与授权访问</h2>
          <StatusBadge tone={allowRegister ? 'good' : 'warn'}>
            {allowRegister ? '开放新用户注册' : '已暂停注册'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting('registration_enabled', {
              enabled: allowRegister,
              allow_oauth: allowOauth,
            });
          }}
          className="space-y-4"
        >
          <div className="rounded-xl border border-white/[0.06] bg-black/20 p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-white">允许新用户自主注册</p>
                <p className="text-[11px] text-white/40">关闭后仅已有用户可登录</p>
              </div>
              <input
                type="checkbox"
                checked={allowRegister}
                onChange={(e) => setAllowRegister(e.target.checked)}
                className="h-4 w-4 rounded"
              />
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.05] pt-3">
              <div>
                <p className="text-xs font-semibold text-white">允许 Google / X / TikTok 登录</p>
                <p className="text-[11px] text-white/40">通过外部第三方快捷鉴权通道</p>
              </div>
              <input
                type="checkbox"
                checked={allowOauth}
                onChange={(e) => setAllowOauth(e.target.checked)}
                className="h-4 w-4 rounded"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-cyan-200">{feedback['registration_enabled']}</span>
            <button
              type="submit"
              disabled={savingKey === 'registration_enabled'}
              className="rounded-xl bg-cyan-300 px-4 py-2 text-xs font-bold text-black hover:bg-cyan-200 disabled:opacity-50"
            >
              {savingKey === 'registration_enabled' ? '保存中…' : '保存注册策略'}
            </button>
          </div>
        </form>
      </Card>

      {/* 维护模式开关 */}
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between border-b border-white/[0.08] pb-3 mb-4">
          <div>
            <h2 className="text-sm font-bold text-white">系统维护模式 (Maintenance Mode)</h2>
            <p className="text-xs text-white/40 mt-1">开启后前台所有页面将显示维护拦截页，仅管理员可正常访问。</p>
          </div>
          <StatusBadge tone={maintEnabled ? 'danger' : 'good'}>
            {maintEnabled ? '维护拦截中' : '对外正常营业'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting('maintenance_mode', {
              enabled: maintEnabled,
              message: maintMsg,
            });
          }}
          className="space-y-3"
        >
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="maint_toggle"
              checked={maintEnabled}
              onChange={(e) => setMaintEnabled(e.target.checked)}
              className="rounded"
            />
            <label htmlFor="maint_toggle" className="text-xs font-semibold text-red-200">
              启用全局维护拦截模式
            </label>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-white/50 mb-1">对外维护提示语</label>
            <input
              type="text"
              value={maintMsg}
              onChange={(e) => setMaintMsg(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-xs text-white outline-none focus:border-cyan-300/60"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-cyan-200">{feedback['maintenance_mode']}</span>
            <button
              type="submit"
              disabled={savingKey === 'maintenance_mode'}
              className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-xs font-bold text-white hover:bg-white/20 disabled:opacity-50"
            >
              {savingKey === 'maintenance_mode' ? '保存中…' : '保存维护设置'}
            </button>
          </div>
        </form>
      </Card>
    </div>
  );
}
