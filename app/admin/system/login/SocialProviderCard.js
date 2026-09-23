'use client';

import { useState, useEffect } from 'react';
import { Card, StatusBadge } from '@/components/admin/AdminUi';
import { DouyinIcon, GoogleIcon, QQIcon, TikTokIcon, WeChatIcon, XIcon } from '@/components/SocialIcons';
import { Copy, Check, ExternalLink, ShieldCheck, Zap, Eye, EyeOff, CheckCircle2, RefreshCw } from 'lucide-react';

const ICON_MAP = {
  google: GoogleIcon,
  x: XIcon,
  tiktok: TikTokIcon,
  wechat_oauth: WeChatIcon,
  qq: QQIcon,
  douyin: DouyinIcon,
};

const CONSOLE_LINKS = {
  google: { label: 'Google Cloud 凭据控制台', url: 'https://console.cloud.google.com/apis/credentials' },
  x: { label: 'X Developer 开发者门户', url: 'https://developer.x.com/en/portal/dashboard' },
  tiktok: { label: 'TikTok for Developers 控制台', url: 'https://developers.tiktok.com/' },
  wechat_oauth: { label: '微信开放平台', url: 'https://open.weixin.qq.com/' },
  qq: { label: 'QQ 互联管理中心', url: 'https://connect.qq.com/manage.html' },
  douyin: { label: '抖音开放平台', url: 'https://developer.open-douyin.com/' },
};

export default function SocialProviderCard({ provider }) {
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(provider.lastCheck || null);
  const [showRotate, setShowRotate] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState('');
  
  // 密钥输入状态及可见性
  const [secretValues, setSecretValues] = useState({});
  const [showPlaintext, setShowPlaintext] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOrigin(window.location.origin);
    }
  }, []);

  // 当展开面板时，将已有公开标识符预填入，方便管理员确认配置
  useEffect(() => {
    if (showRotate && provider.secretKeys) {
      setSecretValues((prev) => {
        const next = { ...prev };
        for (const k of provider.secretKeys) {
          if (!k.isSecret && k.currentValue && next[k.name] === undefined) {
            next[k.name] = k.currentValue;
          }
        }
        return next;
      });
    }
  }, [showRotate, provider.secretKeys]);

  const fullRedirectUri = provider.redirectUri || `${origin || 'https://www.koyosim.com'}${provider.callbackPath || ''}`;

  const handleCopyUri = async () => {
    try {
      await navigator.clipboard.writeText(fullRedirectUri);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const input = document.createElement('input');
      input.value = fullRedirectUri;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInputChange = (name, value) => {
    setSecretValues((prev) => ({ ...prev, [name]: value }));
  };

  const togglePlaintext = (name) => {
    setShowPlaintext((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const runTest = async () => {
    setTesting(true);
    setMessage('');
    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/test`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
      });
      const data = await res.json();
      if (res.ok && data.data) {
        setTestResult(data.data);
        setIsSuccess(true);
        const latency = data.data.latency_ms || data.data.latencyMs || 0;
        const note = data.data.status === 'healthy'
          ? (data.data.details?.note ? '平台网关可达' : '正常在线')
          : data.data.status === 'unconfigured'
            ? '待录入凭证'
            : '响应稍慢或异常';
        setMessage(`探针检测完成：${note} (${latency}ms)`);
      } else {
        setIsSuccess(false);
        const errMsg = data?.error?.message || data?.error || '健康检查请求失败';
        setMessage(`探针诊断失败：${errMsg}`);
      }
    } catch (err) {
      setIsSuccess(false);
      setMessage(`探针连接异常：${err.message || '网络无法连通'}`);
    } finally {
      setTesting(false);
    }
  };

  const handleSaveSecrets = async (e) => {
    e.preventDefault();
    if (!window.confirm(`确认将配置加密写入 ${provider.name} 的安全托管保管库吗？`)) return;

    // 过滤待更新的键值：只发送有输入的键（如果已配置的机密保持留空，则不覆盖更新）
    const secretsToUpdate = {};
    const keyDefs = provider.secretKeys || [
      { name: 'client_id', label: 'Client ID 客户端标识' },
      { name: 'client_secret', label: 'Client Secret 客户端密钥' },
    ];

    for (const k of keyDefs) {
      const val = secretValues[k.name];
      if (typeof val === 'string' && val.trim() !== '') {
        secretsToUpdate[k.name] = val.trim();
      } else if (!k.configured) {
        // 如果该项尚未配置且未输入内容，提示管理员必填
        setMessage(`请完整录入 ${k.label}`);
        setIsSuccess(false);
        return;
      }
    }

    if (Object.keys(secretsToUpdate).length === 0) {
      setMessage('凭证内容未做任何修改');
      setIsSuccess(false);
      return;
    }

    setBusy(true);
    setMessage('');
    setIsSuccess(false);

    try {
      const res = await fetch(`/api/admin/providers/${provider.id}/secret`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({
          secrets: secretsToUpdate,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || data?.error || '配置保存失败');

      setIsSuccess(true);
      setMessage('凭证已通过 AES-256-GCM 加密存盘，正在更新渠道诊断状态。');
      
      // 如果后端返回了存盘后自动探测的结果，直接同步至视图
      if (data?.data?.latestCheck) {
        setTestResult(data.data.latestCheck);
      } else {
        runTest();
      }

      setTimeout(() => {
        setShowRotate(false);
        window.location.reload();
      }, 1500);
    } catch (err) {
      setIsSuccess(false);
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const ProviderIcon = ICON_MAP[provider.id] || Zap;
  const consoleLink = CONSOLE_LINKS[provider.id];

  return (
    <Card className="flex flex-col justify-between relative overflow-hidden border-line-subtle bg-surface hover:border-line transition-colors shadow-elevation-1">
      <div>
        {/* 卡片顶栏：图标、名称与状态 */}
        <div className="flex items-start justify-between border-b border-line-subtle pb-3.5 mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-well border border-line-subtle text-ink">
              <ProviderIcon size={22} />
            </div>
            <div>
              <span className="font-mono text-micro font-semibold uppercase tracking-[0.08em] text-brand">
                SOCIAL AUTH GATEWAY
              </span>
              <h3 className="text-body-md font-semibold text-ink tracking-[-0.01em] leading-6">{provider.name}</h3>
            </div>
          </div>
          <StatusBadge tone={provider.configured ? 'good' : 'warn'}>
            {provider.configured ? '已就绪' : '待配置'}
          </StatusBadge>
        </div>

        {/* 渠道描述 */}
        <p className="text-body-xs text-ink-muted mb-4 leading-5 tracking-[-0.005em]">{provider.description}</p>

        {/* 规范属性面板 */}
        <div className="space-y-2.5 rounded-xl border border-line-subtle bg-well p-3.5 text-body-xs">
          <div className="flex justify-between items-center">
            <span className="text-ink-muted tracking-[0.01em]">授权规范</span>
            <span className="font-mono text-ink">{provider.mode}</span>
          </div>

          <div className="flex justify-between items-center">
            <span className="text-ink-muted tracking-[0.01em]">密钥安全机制</span>
            <span className="inline-flex items-center gap-1 text-brand-hover font-medium">
              <ShieldCheck className="size-3.5 text-brand" />
              写入式（AES-256-GCM 不可反显）
            </span>
          </div>

          {/* 回调地址展示与一键复制 */}
          <div className="border-t border-line-subtle pt-2.5">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-ink-subtle">授权回调重定向地址 (Redirect URI)</span>
              <button
                type="button"
                onClick={handleCopyUri}
                className="inline-flex items-center gap-1 text-micro font-semibold text-brand hover:text-brand-hover transition-colors"
              >
                {copied ? (
                  <>
                    <Check className="size-3 text-good" />
                    <span className="text-good">已复制</span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3" />
                    <span>一键复制</span>
                  </>
                )}
              </button>
            </div>
            <div className="rounded-md bg-well px-2.5 py-1.5 font-mono text-micro text-ink truncate select-all border border-line-subtle">
              {fullRedirectUri}
            </div>
            {provider.callbackHint && (
              <p className="mt-1.5 text-micro leading-4 text-ink-subtle">{provider.callbackHint}</p>
            )}
          </div>

          {/* 开发者控制台直达 */}
          {consoleLink && (
            <div className="flex justify-between items-center border-t border-line-subtle pt-2">
              <span className="text-ink-subtle">凭证申请平台</span>
              <a
                href={consoleLink.url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 text-body-xs text-ink-muted hover:text-brand-hover transition-colors"
              >
                <span>{consoleLink.label}</span>
                <ExternalLink className="size-3 text-ink-subtle" />
              </a>
            </div>
          )}

          {/* 健康检测信息 */}
          {testResult && (
            <div className="flex justify-between items-center border-t border-line-subtle pt-2">
              <span className="text-ink-muted tracking-[0.01em]">最近健康探针</span>
              {testResult.status === 'healthy' ? (
                <span className="inline-flex items-center gap-1.5 text-body-xs font-semibold text-good">
                  <span className="size-1.5 rounded-full bg-good" />
                  正常在线 ({testResult.latency_ms || testResult.latencyMs || 0}ms)
                </span>
              ) : testResult.status === 'unconfigured' ? (
                <span className="inline-flex items-center gap-1.5 text-body-xs font-medium text-warn">
                  <span className="size-1.5 rounded-full bg-warn" />
                  待录入凭证
                </span>
              ) : testResult.status === 'degraded' ? (
                <span className="inline-flex items-center gap-1.5 text-body-xs font-medium text-warn">
                  <span className="size-1.5 rounded-full bg-warn" />
                  响应稍慢 ({testResult.latency_ms || testResult.latencyMs || 0}ms)
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-danger" title={testResult.details?.error || testResult.error_code}>
                  <span className="size-1.5 rounded-full bg-danger" />
                  网络离线 / 超时
                </span>
              )}
            </div>
          )}
        </div>

        {/* 密钥配置折叠表单 */}
        {showRotate && (
          <form onSubmit={handleSaveSecrets} className="mt-4 rounded-xl border border-line-subtle bg-well p-4 space-y-3.5 backdrop-blur-sm animate-fade-in">
            <div className="flex items-center justify-between border-b border-line-subtle pb-2">
              <p className="text-body-xs font-semibold text-brand-hover tracking-[-0.005em]">凭证托管录入（安全加密存盘）</p>
              <span className="text-micro text-ink-subtle font-mono">Vault Encrypted</span>
            </div>

            {/* 动态密钥列表 */}
            {(provider.secretKeys || [
              { name: 'client_id', label: 'Client ID 客户端标识', placeholder: '输入客户端 ID' },
              { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: '输入客户端密钥' },
            ]).map((keyDef) => {
              const hasConfigured = Boolean(keyDef.configured);
              const isSecret = keyDef.isSecret !== false;
              const inputType = (!isSecret || showPlaintext[keyDef.name]) ? 'text' : 'password';

              return (
                <div key={keyDef.name} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="block text-body-xs text-ink-muted font-medium tracking-[0.01em]">
                      {keyDef.label}
                    </label>
                    {hasConfigured && (
                      <span className="inline-flex items-center gap-1 text-micro font-mono text-good bg-good-soft px-1.5 py-0.5 rounded border border-good-line">
                        <CheckCircle2 className="size-2.5" />
                        已托管存盘
                      </span>
                    )}
                  </div>

                  <div className="relative flex items-center">
                    <input
                      type={inputType}
                      value={secretValues[keyDef.name] !== undefined ? secretValues[keyDef.name] : ''}
                      onChange={(e) => handleInputChange(keyDef.name, e.target.value)}
                      placeholder={
                        hasConfigured
                          ? (isSecret ? '•••••••••••••••• (留空保持现有凭证，输入新值覆盖)' : keyDef.placeholder || '输入新值覆盖')
                          : (keyDef.placeholder || '请输入凭证明文…')
                      }
                      className="h-control-md w-full rounded-md border border-line-subtle bg-well px-3 pr-9 text-body-xs text-ink font-mono placeholder:text-ink-subtle focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring transition-colors"
                    />
                    {isSecret && (
                      <button
                        type="button"
                        onClick={() => togglePlaintext(keyDef.name)}
                        className="absolute right-2 text-ink-muted hover:text-ink p-1"
                        title={showPlaintext[keyDef.name] ? '隐藏明文' : '查看明文'}
                      >
                        {showPlaintext[keyDef.name] ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                      </button>
                    )}
                  </div>

                  {hasConfigured && keyDef.updatedAt && (
                    <p className="text-micro text-ink-subtle">
                      上次更新时间：{keyDef.updatedAt.slice(0, 19).replace('T', ' ')}
                    </p>
                  )}
                </div>
              );
            })}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowRotate(false);
                  setMessage('');
                }}
                className="h-control-sm rounded-md border border-line-subtle bg-transparent px-3 text-body-xs font-medium text-ink-muted hover:bg-well hover:text-ink transition-colors"
              >
                取消
              </button>
              <button
                type="submit"
                disabled={busy}
                className="h-control-sm rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-xs font-semibold text-ink-on-accent transition-colors disabled:opacity-50"
              >
                {busy ? '正在加密保存…' : '安全提交凭证'}
              </button>
            </div>

            {message && (
              <div className={`text-body-xs p-2.5 rounded-md text-center font-medium ${isSuccess ? 'bg-good-soft text-good border border-good-line' : 'bg-danger-soft text-danger border border-danger-line'}`}>
                {message}
              </div>
            )}
          </form>
        )}
      </div>

      {/* 底部功能条：契约高度 38px */}
      <div className="mt-5 pt-3.5 border-t border-line-subtle flex items-center justify-between">
        <button
          type="button"
          disabled={testing}
          onClick={runTest}
          className="inline-flex h-control-md items-center gap-1.5 rounded-md border border-line-subtle bg-raised hover:bg-raised-hover px-3.5 text-body-xs font-medium text-label transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${testing ? 'animate-spin text-brand' : ''}`} />
          {testing ? '探针探测中…' : '测试连接 / 网关可达性探针'}
        </button>

        <button
          type="button"
          onClick={() => {
            setShowRotate(!showRotate);
            setMessage('');
          }}
          className="inline-flex h-control-md items-center rounded-md border border-brand-line bg-brand-soft px-4 text-body-xs font-semibold text-brand-hover hover:bg-brand-pressed transition-colors"
        >
          {showRotate ? '收起面板' : '配置密钥 / 轮换 ⚙'}
        </button>
      </div>
    </Card>
  );
}
