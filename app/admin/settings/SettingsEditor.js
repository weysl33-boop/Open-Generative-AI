'use client';

import { useState } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';
import { resolveCreditValuationFromSetting } from '@/lib/financial/creditValuation';

export default function SettingsEditor({ initialSettings, gateDiagnostics }) {
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
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': crypto.randomUUID() },
        body: JSON.stringify({ key, value, visibility }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '保存失败');

      // warning 表示库里存下了但运行时没生效（例如镜像文件写失败），不能提示成功。
      if (data?.data?.warning) {
        setFeedback((prev) => ({ ...prev, [key]: data.data.warning }));
        return data;
      }

      setFeedback((prev) => ({ ...prev, [key]: '已成功更新并留存审计' }));
      setTimeout(() => {
        setFeedback((prev) => ({ ...prev, [key]: '' }));
      }, 3000);
      return data;
    } catch (err) {
      setFeedback((prev) => ({ ...prev, [key]: `错误: ${err.message}` }));
      return null;
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

  // 4. 探索应用 (Explore Apps) 入口开关 (默认隐藏)
  const exploreAppsCfg = getVal('feature_explore_apps', { enabled: false });
  const [exploreAppsEnabled, setExploreAppsEnabled] = useState(Boolean(exploreAppsCfg.enabled));

  // 6. Credits 估值口径：预览必须走服务端同一个纯函数，否则这里显示「合法」而线上退回内置值
  const creditValuation = resolveCreditValuationFromSetting(getVal('credit_valuation', null));
  const [creditUsdInput, setCreditUsdInput] = useState(String(creditValuation.usdPerCredit));

  // 5. 中国大陆 IP 访问拦截（middleware 层，默认关闭）
  const gate = getVal('china_ip_block', {});
  const [gateEnabled, setGateEnabled] = useState(Boolean(gate.enabled));
  const [gateAction, setGateAction] = useState(gate.action === 'icp_notice' ? 'icp_notice' : 'forbidden');
  const [gateMsg, setGateMsg] = useState(gate.custom_message || '');
  const [gateBlockApi, setGateBlockApi] = useState(gate.block_api !== false);
  const [gateWhitelist, setGateWhitelist] = useState(gate.whitelist_ips || '');
  const [syncingLib, setSyncingLib] = useState(false);

  const diag = gateDiagnostics || {};
  const lib = diag.library || {};
  // 库里存的开关与 middleware 实际读到的镜像不一致 = 镜像没写成功，拦截不会生效。
  const gateDrift = typeof diag.runtimeEnabled === 'boolean' && diag.runtimeEnabled !== gateEnabled;

  const whitelistCurrentIp = () => {
    const ip = (diag.clientIp || '').trim();
    if (!ip) return;
    const entries = gateWhitelist.split(/[\n,;]/).map((s) => s.trim()).filter(Boolean);
    if (entries.includes(ip)) return;
    setGateWhitelist([...entries, ip].join('\n'));
  };

  const syncIpLibrary = async () => {
    setSyncingLib(true);
    setFeedback((prev) => ({ ...prev, china_ip_block: '' }));
    try {
      const res = await fetch('/api/admin/settings/sync-ip-list', {
        method: 'POST',
        headers: { 'Idempotency-Key': crypto.randomUUID() },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || '同步失败');
      setFeedback((prev) => ({ ...prev, china_ip_block: data?.data?.message || 'IP 库同步完成' }));
    } catch (err) {
      setFeedback((prev) => ({ ...prev, china_ip_block: `错误: ${err.message}` }));
    } finally {
      setSyncingLib(false);
    }
  };

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* 探索应用 (Explore Apps) 侧边栏开关 */}
      <Card className="lg:col-span-2 border-brand-soft bg-scrim">
        <div className="flex items-center justify-between border-b border-line pb-3 mb-4">
          <div className="space-y-1">
            <h2 className="text-sm font-bold text-ink">探索应用 (Explore Apps) 侧边栏入口</h2>
            <p className="text-xs text-ink-muted">
              控制 Studio 创作者左侧侧边栏底部的「Explore Apps」功能入口。首发上线建议保持隐藏，待正式生态插件发布后开启。
            </p>
          </div>
          <StatusBadge tone={exploreAppsEnabled ? 'good' : 'neutral'}>
            {exploreAppsEnabled ? '前台已显示' : '已隐藏 (推荐)'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting('feature_explore_apps', {
              enabled: exploreAppsEnabled,
            });
          }}
          className="flex flex-wrap items-center justify-between gap-4 pt-1"
        >
          <div className="flex items-center gap-3">
            <input
              type="checkbox"
              id="explore_apps_toggle"
              checked={exploreAppsEnabled}
              onChange={(e) => setExploreAppsEnabled(e.target.checked)}
              className="size-4 rounded border-line-strong bg-well text-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
            />
            <label htmlFor="explore_apps_toggle" className="text-body-xs font-semibold text-ink select-none cursor-pointer">
              在前台左侧导航栏显示「Explore Apps (应用探索)」入口
            </label>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-body-xs text-brand-hover">{feedback['feature_explore_apps']}</span>
            <button
              type="submit"
              disabled={savingKey === 'feature_explore_apps'}
              className="h-control-sm rounded-md border border-brand-line bg-brand-soft px-3 text-body-xs font-semibold text-brand-hover hover:bg-brand-pressed disabled:opacity-50 transition-colors"
            >
              {savingKey === 'feature_explore_apps' ? '保存中…' : '保存应用入口设置'}
            </button>
          </div>
        </form>
      </Card>
      {/* 前端Logo与导航菜单管理 */}
      <Card className="lg:col-span-2 border-line-subtle bg-surface shadow-elevation-1">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex size-2 rounded-full bg-brand" />
              <h2 className="text-body-sm font-bold text-ink">前端Logo与导航菜单管理</h2>
              <StatusBadge tone="good">动态全站响应</StatusBadge>
            </div>
            <p className="text-body-xs text-ink-muted">
              支持调整 Studio 及全站前台 Logo 模式（矢量/图片/纯文字）、徽标配色盘、点击跳转路径以及顶栏右侧菜单按钮的增删改查、排序和角标样式。
            </p>
          </div>
          <a
            href="/admin/content/branding"
            className="inline-flex items-center gap-1.5 h-control-md rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-sm font-semibold text-ink-on-accent transition-colors shadow-elevation-1"
          >
            进入前端管理工作台 →
          </a>
        </div>
      </Card>

      {/* 全站公告横幅 */}
      <Card>
        <div className="flex items-center justify-between border-b border-line-subtle pb-3 mb-4">
          <h2 className="text-body-sm font-bold text-ink">前台全站横幅公告 (Banner)</h2>
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
              className="size-4 rounded border-line-strong bg-well text-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
            />
            <label htmlFor="banner_toggle" className="text-body-xs text-ink cursor-pointer select-none">
              启用前台顶部公告横幅
            </label>
          </div>

          <div>
            <label className="block text-micro font-semibold text-ink-subtle mb-1">公告文案内容</label>
            <input
              type="text"
              required
              value={bannerMsg}
              onChange={(e) => setBannerMsg(e.target.value)}
              placeholder="例如：系统已升级支持全新 Flux 与 Hailuo 视频生成模型！"
              className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink placeholder:text-ink-subtle focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
            />
          </div>

          <div>
            <label className="block text-micro font-semibold text-ink-subtle mb-1">展示色调风格</label>
            <select
              value={bannerTone}
              onChange={(e) => setBannerTone(e.target.value)}
              className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
            >
              <option value="info">冰青 (信息通知)</option>
              <option value="good">翠绿 (新功能/福利)</option>
              <option value="warn">琥珀 (注意/提醒)</option>
            </select>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-body-xs text-brand-hover">{feedback['site_banner']}</span>
            <button
              type="submit"
              disabled={savingKey === 'site_banner'}
              className="h-control-md rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-sm font-semibold text-ink-on-accent disabled:opacity-50 transition-colors"
            >
              {savingKey === 'site_banner' ? '保存中…' : '保存公告配置'}
            </button>
          </div>
        </form>
      </Card>

      {/* 注册与第三方登录开关 */}
      <Card>
        <div className="flex items-center justify-between border-b border-line-subtle pb-3 mb-4">
          <h2 className="text-body-sm font-bold text-ink">用户注册与授权访问</h2>
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
          <div className="rounded-xl border border-line-subtle bg-well p-3.5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body-xs font-semibold text-ink">允许新用户自主注册</p>
                <p className="text-micro text-ink-subtle">关闭后仅已有用户可登录</p>
              </div>
              <input
                type="checkbox"
                checked={allowRegister}
                onChange={(e) => setAllowRegister(e.target.checked)}
                className="size-4 rounded border-line-strong bg-well text-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
              />
            </div>

            <div className="flex items-center justify-between border-t border-line-subtle pt-3">
              <div>
                <p className="text-body-xs font-semibold text-ink">允许 Google / X / TikTok 登录</p>
                <p className="text-micro text-ink-subtle">通过外部第三方快捷鉴权通道</p>
              </div>
              <input
                type="checkbox"
                checked={allowOauth}
                onChange={(e) => setAllowOauth(e.target.checked)}
                className="size-4 rounded border-line-strong bg-well text-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
              />
            </div>
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-body-xs text-brand-hover">{feedback['registration_enabled']}</span>
            <button
              type="submit"
              disabled={savingKey === 'registration_enabled'}
              className="h-control-md rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-sm font-semibold text-ink-on-accent disabled:opacity-50 transition-colors"
            >
              {savingKey === 'registration_enabled' ? '保存中…' : '保存注册策略'}
            </button>
          </div>
        </form>
      </Card>

      {/* Credits 估值口径：模型中心与财务报表共用的换算数字 */}
      <Card className="lg:col-span-2">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-line-subtle pb-3">
          <div>
            <h2 className="text-body-sm font-bold text-ink">Credits 估值口径</h2>
            <p className="mt-1 text-body-xs text-ink-subtle">
              模型中心的用户售价与毛利、成本中心和利润中心报表都按这一个数字折算。
              留空即使用内置默认值；报价链路不再自带第二套估值，避免同一个消耗算出两个毛利率。
            </p>
          </div>
          <StatusBadge tone={creditValuation.source === 'setting' ? 'good' : 'warn'}>
            {creditValuation.source === 'setting'
              ? '按系统设置'
              : creditValuation.source === 'invalid'
                ? '设置值非法，已退回默认'
                : '未设置，用内置值'}
          </StatusBadge>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting(
              'credit_valuation',
              { usdPerCredit: Number(creditUsdInput) },
              'private',
            );
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-body-xs font-semibold text-ink">1 Credit = ? USD</span>
              <input
                type="number"
                step="0.0001"
                min="0"
                value={creditUsdInput}
                onChange={(e) => setCreditUsdInput(e.target.value)}
                className="mt-1 h-control-md w-full rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring font-mono"
              />
            </label>
            <p className="self-end text-body-xs leading-5 text-ink-subtle">
              人民币只是这个美元估值的展示换算，汇率沿用系统内部常量，不在这里改：
              渠道成本的币种换算走另一条链路，放开一半会造成「改了不生效」的假设置。
            </p>
          </div>

          <p className="text-body-xs text-ink-subtle">
            当前生效：1 Credit ={' '}
            <span className="font-mono text-ink">{creditValuation.usdPerCredit.toFixed(4)} USD</span>
            {' · '}
            <span className="font-mono text-ink">≈ ¥{creditValuation.cnyPerCredit.toFixed(4)}</span>
            {' · '}
            <span className="font-mono text-ink">{creditValuation.creditsPerUsd}</span> Credits / USD
          </p>

          <div className="flex items-center justify-between pt-2">
            <span className="text-body-xs text-brand-hover">{feedback['credit_valuation']}</span>
            <button
              type="submit"
              disabled={savingKey === 'credit_valuation' || !(Number(creditUsdInput) > 0)}
              className="h-control-md rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-sm font-semibold text-ink-on-accent disabled:opacity-50 transition-colors"
            >
              {savingKey === 'credit_valuation' ? '保存中…' : '保存估值口径'}
            </button>
          </div>
        </form>
      </Card>
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between border-b border-line-subtle pb-3 mb-4">
          <div>
            <h2 className="text-body-sm font-bold text-ink">系统维护模式 (Maintenance Mode)</h2>
            <p className="text-body-xs text-ink-subtle mt-1">开启后前台所有页面将显示维护拦截页，仅管理员可正常访问。</p>
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
              className="size-4 rounded border-line-strong bg-well text-danger focus-visible:ring-1 focus-visible:ring-brand-ring"
            />
            <label htmlFor="maint_toggle" className="text-body-xs font-semibold text-danger cursor-pointer select-none">
              启用全局维护拦截模式
            </label>
          </div>

          <div>
            <label className="block text-micro font-semibold text-ink-subtle mb-1">对外维护提示语</label>
            <input
              type="text"
              value={maintMsg}
              onChange={(e) => setMaintMsg(e.target.value)}
              className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink outline-none focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
            />
          </div>

          <div className="flex items-center justify-between pt-2">
            <span className="text-body-xs text-brand-hover">{feedback['maintenance_mode']}</span>
            <button
              type="submit"
              disabled={savingKey === 'maintenance_mode'}
              className="h-control-md rounded-md border border-line-subtle bg-raised hover:bg-raised-hover px-4 text-body-sm font-semibold text-label disabled:opacity-50 transition-colors"
            >
              {savingKey === 'maintenance_mode' ? '保存中…' : '保存维护设置'}
            </button>
          </div>
        </form>
      </Card>

      {/* 中国大陆 IP 访问拦截 */}
      <Card className="lg:col-span-2">
        <div className="flex items-center justify-between gap-4 border-b border-line-subtle pb-3 mb-4">
          <div className="space-y-1">
            <h2 className="text-body-sm font-bold text-ink">中国大陆 IP 访问拦截</h2>
            <p className="text-body-xs text-ink-muted">
              在 middleware 层对命中中国大陆网段的访问者返回真实 HTTP 403，前台页面与 API 一并生效。
              境内管理员无法靠登录态放行（middleware 读不到会话），必须先加入下方 IP 白名单。
            </p>
          </div>
          <StatusBadge tone={gateEnabled ? 'danger' : 'neutral'}>
            {gateEnabled ? '拦截已开启' : '未拦截（默认）'}
          </StatusBadge>
        </div>

        {/* 运行时诊断 */}
        <div className="mb-4 rounded-xl border border-line-subtle bg-well p-3.5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-body-xs font-semibold text-ink-subtle">本机访问诊断</p>
            {diag.forcedOff && (
              <StatusBadge tone="warn">环境变量已强制停用拦截</StatusBadge>
            )}
          </div>
          <dl className="grid gap-2 sm:grid-cols-2">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body-xs text-ink-subtle">识别到的来访 IP</dt>
              <dd className="font-mono text-body-xs text-ink">{diag.clientIp || '未知'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body-xs text-ink-subtle">来源请求头</dt>
              <dd className="font-mono text-body-xs text-ink">{diag.ipSource || '未知'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body-xs text-ink-subtle">是否命中中国大陆网段</dt>
              <dd className="text-body-xs font-semibold text-ink">{diag.isChinaIp ? '是' : '否'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-body-xs text-ink-subtle">运行时实际生效状态</dt>
              <dd className="text-body-xs font-semibold text-ink">{diag.runtimeEnabled ? '拦截中' : '未拦截'}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 sm:col-span-2">
              <dt className="text-body-xs text-ink-subtle">IP 网段库</dt>
              <dd className="text-right text-body-xs text-ink">
                {lib.loaded
                  ? `IPv4 ${lib.v4Ranges} 段 · IPv6 ${lib.v6Ranges} 段 · 更新于 ${lib.updatedAt || '未知'}`
                  : '未加载（拦截会整体放行）'}
              </dd>
            </div>
          </dl>
          {(diag.ipSource === 'unknown-defaults' || diag.ipSource === 'missing-headers') && (
            <p className="mt-2 text-body-xs text-ink-subtle">
              提示：来访 IP 落到回环默认值，说明上游代理没有传递真实 IP，拦截不会对任何访客生效。
              请检查 nginx 的
              <span className="font-mono"> proxy_set_header X-Real-IP $remote_addr </span>
              配置。
            </p>
          )}
          {gateDrift && (
            <p className="mt-2 text-body-xs font-semibold text-ink">
              后台保存的开关与运行时镜像不一致，拦截按「{diag.runtimeEnabled ? '已开启' : '未开启'}」执行。
              重新保存下方配置即可修复；若仍不一致，说明进程无法写入{" "}
              <span className="font-mono">{diag.stateFile}</span>。
            </p>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            saveSetting(
              'china_ip_block',
              {
                enabled: gateEnabled,
                action: gateAction,
                custom_message: gateMsg,
                block_api: gateBlockApi,
                whitelist_ips: gateWhitelist,
              },
              'private',
            );
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border border-line-subtle bg-well p-3.5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-body-xs font-semibold text-ink">启用中国大陆 IP 拦截</p>
                  <p className="text-micro text-ink-subtle">开启前请先确认下方白名单</p>
                </div>
                <input
                  type="checkbox"
                  id="gate_toggle"
                  checked={gateEnabled}
                  onChange={(e) => setGateEnabled(e.target.checked)}
                  className="size-4 rounded border-line-strong bg-well text-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
                />
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 border-t border-line-subtle pt-3">
                <div>
                  <p className="text-body-xs font-semibold text-ink">同时拦截 /api 接口</p>
                  <p className="text-micro text-ink-subtle">支付与生成回调地址不受影响</p>
                </div>
                <input
                  type="checkbox"
                  id="gate_api_toggle"
                  checked={gateBlockApi}
                  onChange={(e) => setGateBlockApi(e.target.checked)}
                  disabled={!gateEnabled}
                  className="size-4 rounded border-line-strong bg-well text-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="gate_action" className="block text-micro font-semibold text-ink-subtle mb-1">
                  对境内访客的展示方式
                </label>
                <select
                  id="gate_action"
                  value={gateAction}
                  onChange={(e) => setGateAction(e.target.value)}
                  className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                >
                  <option value="forbidden">默认 403 页面（nginx 风格，无任何品牌信息）</option>
                  <option value="icp_notice">备案提示页（说明正在办理 ICP 备案）</option>
                </select>
              </div>

              {gateAction === 'icp_notice' && (
                <div>
                  <label htmlFor="gate_msg" className="block text-micro font-semibold text-ink-subtle mb-1">
                    备案提示页文案（留空使用默认文案）
                  </label>
                  <input
                    id="gate_msg"
                    type="text"
                    value={gateMsg}
                    onChange={(e) => setGateMsg(e.target.value)}
                    maxLength={500}
                    placeholder="网站正在办理工信部ICP备案审核，暂不对中国大陆境内用户提供访问服务。"
                    className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
              <label htmlFor="gate_whitelist" className="text-micro font-semibold text-ink-subtle">
                放行 IP 白名单（每行一个，支持 IPv4 CIDR）
              </label>
              <button
                type="button"
                onClick={whitelistCurrentIp}
                disabled={!diag.clientIp}
                className="h-control-xs rounded px-2.5 text-body-xs font-medium border border-line-subtle bg-raised hover:bg-raised-hover text-label disabled:opacity-50 transition-colors"
              >
                把当前 IP 加入白名单
              </button>
            </div>
            <textarea
              id="gate_whitelist"
              rows={3}
              value={gateWhitelist}
              onChange={(e) => setGateWhitelist(e.target.value)}
              maxLength={4000}
              placeholder={'203.0.113.24\n198.51.100.0/24'}
              className="w-full rounded-md border border-line-subtle bg-well p-3 font-mono text-body-xs text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <span className="text-body-xs text-brand">{feedback['china_ip_block']}</span>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={syncIpLibrary}
                disabled={syncingLib}
                className="h-control-md rounded-md border border-line-subtle bg-raised hover:bg-raised-hover px-4 text-body-sm font-semibold text-label disabled:opacity-50 transition-colors"
              >
                {syncingLib ? '同步中…' : '同步最新 IP 库'}
              </button>
              <button
                type="submit"
                disabled={savingKey === 'china_ip_block'}
                className="h-control-md rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-sm font-semibold text-ink-on-accent disabled:opacity-50 transition-colors"
              >
                {savingKey === 'china_ip_block' ? '保存中…' : '保存拦截设置'}
              </button>
            </div>
          </div>
        </form>
      </Card>
    </div>
  );
}
