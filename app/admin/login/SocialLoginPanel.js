'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SegmentedControl } from 'studio/ui/navigation';
import { Card, StatusBadge } from '@/components/admin/AdminUi';
import SocialProviderCard from './SocialProviderCard';

const REGION_TABS = [
  { value: 'mainland_china', label: '中国大陆渠道' },
  { value: 'international', label: '海外渠道' },
];

const CHANNEL_LABELS = {
  wechat: '微信',
  qq: 'QQ',
  douyin: '抖音',
  google: 'Google',
  x: 'X (Twitter)',
  tiktok: 'TikTok',
};

function initialEnabled(regions) {
  const map = {};
  for (const region of regions) {
    for (const channel of region.channels) map[channel.id] = channel.enabled;
  }
  return map;
}

export default function SocialLoginPanel({ regions, diagnostics, canWrite }) {
  const [region, setRegion] = useState(regions[0]?.id || 'mainland_china');
  const [enabled, setEnabled] = useState(() => initialEnabled(regions));
  const [savedEnabled, setSavedEnabled] = useState(() => initialEnabled(regions));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');

  const active = regions.find((item) => item.id === region) || regions[0];
  const dirty = regions.some((item) =>
    item.channels.some((channel) => Boolean(enabled[channel.id]) !== Boolean(savedEnabled[channel.id]))
  );

  const save = async () => {
    setBusy(true);
    setMessage('');
    try {
      const config = Object.fromEntries(
        regions.map((item) => [
          item.id,
          item.channels.map((channel) => ({ id: channel.id, enabled: Boolean(enabled[channel.id]) })),
        ])
      );
      const response = await fetch('/api/admin/login/social-regions', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ config }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error?.message || '分区配置保存失败');
      setSavedEnabled({ ...enabled });
      setNotice('前台展示分区已更新，下一次访客打开登录框即生效。');
      setTimeout(() => setNotice(''), 4000);
    } catch (error) {
      setMessage(error.message || '分区配置保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-3 mb-4">
          <div className="space-y-1">
            <h2 className="text-card-title text-ink">按访客 IP 分区展示</h2>
            <p className="text-body-sm text-ink-muted">
              分区只认访客的网络 IP，语言、时区与账号资料都不会改变它。境内访客看到中国大陆渠道，其余访客看到海外渠道。
            </p>
          </div>
          <StatusBadge tone={diagnostics.region === 'mainland_china' ? 'info' : 'neutral'}>
            {diagnostics.region === 'mainland_china' ? '本次访问：中国大陆' : '本次访问：海外'}
          </StatusBadge>
        </div>

        <dl className="grid gap-2 sm:grid-cols-2">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body-sm text-ink-subtle">识别到的来访 IP</dt>
            <dd className="text-mono text-ink">{diagnostics.clientIp || '未知'}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-body-sm text-ink-subtle">来源请求头</dt>
            <dd className="text-mono text-ink">{diagnostics.ipSource || '未知'}</dd>
          </div>
        </dl>

        {(diagnostics.ipSource === 'unknown-defaults' || diagnostics.ipSource === 'missing-headers') && (
          <p className="mt-3 text-body-sm text-warning">
            来访 IP 落到了回环默认值，说明 nginx 没有透传真实 IP（<span className="text-mono">proxy_set_header X-Real-IP $remote_addr</span>）。
            此时所有访客都会被判为海外分区，境内访客将看到 Google / X / TikTok。
          </p>
        )}
        {diagnostics.gateEnabled && (
          <p className="mt-3 text-body-sm text-ink-subtle">
            中国大陆 IP 拦截当前处于开启状态，境内访客在到达登录框之前就会被 403 拦下。
            要调整请去 <Link href="/admin/settings" className="text-brand-hover underline">系统设置</Link>。
          </p>
        )}
      </Card>

      <SegmentedControl
        ariaLabel="社交登录分区"
        size="sm"
        value={region}
        onValueChange={setRegion}
        options={REGION_TABS.filter((tab) => regions.some((item) => item.id === tab.value))}
        className="max-w-md"
      />

      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-line bg-well px-4 py-3">
          <h3 className="text-label text-ink">{active?.label}渠道</h3>
          <p className="mt-1 text-body-sm text-ink-muted">{active?.description}</p>
        </div>

        {active?.channels.map((channel) => {
          const visible = Boolean(enabled[channel.id]) && channel.configured;
          return (
            <div key={channel.id} className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-base px-4 py-3">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-label text-ink">
                    <input
                      type="checkbox"
                      className="size-4 rounded border-line-strong bg-scrim text-brand focus:ring-brand"
                      checked={Boolean(enabled[channel.id])}
                      disabled={!canWrite}
                      onChange={(event) =>
                        setEnabled((current) => ({ ...current, [channel.id]: event.target.checked }))
                      }
                    />
                    前台展示{CHANNEL_LABELS[channel.id] || channel.name}
                  </label>
                  {!channel.configured && <StatusBadge tone="warn">凭据未录入</StatusBadge>}
                  {channel.configured && !enabled[channel.id] && <StatusBadge tone="neutral">已隐藏</StatusBadge>}
                  {visible && <StatusBadge tone="good">对该分区可见</StatusBadge>}
                </div>
                <span className="text-caption text-ink-subtle">
                  {channel.provider?.mode || 'OAuth 2.0'}
                </span>
              </div>
              {channel.provider ? (
                <SocialProviderCard provider={channel.provider} />
              ) : (
                <p className="text-body-sm text-danger">
                  渠道 {channel.id} 缺少后台凭据记录，无法在此配置，请检查供应商中台数据。
                </p>
              )}
            </div>
          );
        })}
      </div>

      {canWrite && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-well px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-body-sm text-ink-muted">
              {dirty ? '存在未保存的分区展示变更' : '分区展示与线上一致'}
            </span>
            {notice && <span className="text-body-sm text-success">{notice}</span>}
            {message && <span className="text-body-sm text-danger">{message}</span>}
          </div>
          <button
            type="button"
            onClick={save}
            disabled={busy || !dirty}
            className="h-9 rounded-lg bg-brand px-4 text-label text-ink-on-accent hover:bg-brand-hover disabled:opacity-50"
          >
            {busy ? '保存中…' : '保存分区设置'}
          </button>
        </div>
      )}
    </div>
  );
}
