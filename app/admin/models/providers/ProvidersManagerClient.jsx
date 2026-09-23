'use client';

import { useState } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Server, Key, ShieldCheck, Zap, Plus, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

const PROBE_KIND_LABEL = {
  http: 'HTTP 实测',
  credential: '仅凭据校验',
};

const PROBE_FEEDBACK_CLASS = {
  good: 'bg-success-soft text-success border border-success-line',
  warn: 'bg-warning-soft text-warning border border-warning-line',
  danger: 'bg-danger-soft text-danger border border-danger-line',
};

// 一次探测结论的展示口径：上游 503 也是一次"成功跑完"的探测，
// 所以颜色必须跟着 healthStatus 走，不能跟着 HTTP 状态码走。
function feedbackFromProbe(result) {
  const kind = PROBE_KIND_LABEL[result.probeKind] ?? '口径未知的探针';
  // 仅凭据校验没有网络往返，延迟是 null，补成 0ms 就成了"这个渠道秒回"。
  const latency = Number.isFinite(result.latencyMs) ? ` · ${Math.round(result.latencyMs)}ms` : '';
  const tone = result.healthStatus === 'healthy' ? 'good' : result.healthStatus === 'degraded' ? 'warn' : 'danger';
  return { type: tone, text: `${kind} · ${result.message || '探测无返回'}${latency}` };
}

export default function ProvidersManagerClient({ initialProviders = [] }) {
  const [providers, setProviders] = useState(initialProviders);
  const [editingProvider, setEditingProvider] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [probeLoadingId, setProbeLoadingId] = useState(null);
  const [probeResult, setProbeResult] = useState(null);

  // 统计指标
  const totalCount = providers.length;
  const enabledCount = providers.filter((p) => p.enabled).length;
  const openCircuitCount = providers.filter((p) => p.circuit_state === 'circuit_open').length;

  const handleTestProbe = async (providerId) => {
    setProbeLoadingId(providerId);
    setProbeResult(null);
    try {
      const res = await fetch('/api/admin/models/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const payload = await res.json().catch(() => null);
      const result = payload?.data?.results?.[0];
      if (!res.ok || !result) {
        setProbeResult({ providerId, type: 'danger', text: payload?.error?.message || '探测请求失败' });
      } else {
        setProbeResult({ providerId, ...feedbackFromProbe(result) });
        // 后端已经把新的健康度落库，行上的徽章要跟着回读到的值变，
        // 否则探测完显示的还是探测前那一版状态。
        setProviders((prev) =>
          prev.map((p) => (p.id === providerId ? { ...p, health_status: result.healthStatus } : p))
        );
      }
    } catch (err) {
      setProbeResult({ providerId, type: 'danger', text: err.message || '网络连接异常' });
    } finally {
      setProbeLoadingId(null);
    }
  };

  const handleToggleEnabled = async (provider) => {
    const nextEnabled = !provider.enabled;
    try {
      const res = await fetch('/api/admin/models/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: provider.id,
          name: provider.name,
          enabled: nextEnabled,
        }),
      });
      if (res.ok) {
        setProviders((prev) =>
          prev.map((p) => (p.id === provider.id ? { ...p, enabled: nextEnabled } : p))
        );
      }
    } catch (e) {
      alert('切换状态失败: ' + e.message);
    }
  };

  const handleSaveProvider = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    const form = e.target;
    const payload = {
      id: form.id.value.trim().toLowerCase(),
      name: form.name.value.trim(),
      providerType: form.providerType.value,
      priority: Number(form.priority.value || 100),
      baseUrl: form.baseUrl.value.trim(),
      apiMode: form.apiMode.value,
      apiKey: form.apiKey.value.trim() || undefined,
      enabled: form.enabled.checked,
    };

    try {
      const res = await fetch('/api/admin/models/providers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        const saved = data.data.provider;
        setProviders((prev) => {
          const idx = prev.findIndex((p) => p.id === saved.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...saved, hasApiKey: payload.apiKey ? true : next[idx].hasApiKey };
            return next;
          }
          return [...prev, { ...saved, hasApiKey: Boolean(payload.apiKey) }];
        });
        setEditingProvider(null);
        setIsCreating(false);
      } else {
        alert(data.error?.message || '保存供应商失败');
      }
    } catch (err) {
      alert('保存出错: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 顶部指标 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <MetricCard label="接入供应商总数" value={totalCount} hint="覆盖主流聚合与原生大厂 API" tone="info" />
        <MetricCard label="已启用服务" value={enabledCount} hint="参与智能路由候选池" tone="good" />
        <MetricCard label="熔断阻断通道" value={openCircuitCount} hint="连续失败阈值保护中" tone={openCircuitCount > 0 ? 'danger' : 'neutral'} />
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">AI 供应商列表</h2>
        <Button
          onClick={() => {
            setIsCreating(true);
            setEditingProvider({
              id: '',
              name: '',
              provider_type: 'aggregator',
              priority: 100,
              base_url: '',
              api_mode: 'async',
              enabled: true,
            });
          }}
          className="bg-brand-active hover:bg-brand text-ink-on-accent font-medium"
        >
          <Plus className="mr-1.5 size-4" />
          新增供应商
        </Button>
      </div>

      {/* 供应商卡片列表 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {providers.map((p) => {
          const isProbeLoading = probeLoadingId === p.id;
          const isCircuitOpen = p.circuit_state === 'circuit_open';

          return (
            <Card key={p.id} className="relative overflow-hidden border-line hover:border-line-strong transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-mono text-ink-muted">[{p.id}]</span>
                    <h3 className="text-base font-semibold text-ink">{p.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted font-mono truncate max-w-xs">
                    {p.base_url || '官方默认 Endpoint'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={p.enabled ? 'good' : 'neutral'}>
                    {p.enabled ? '已启用' : '已禁用'}
                  </StatusBadge>
                  <StatusBadge
                    tone={
                      isCircuitOpen
                        ? 'danger'
                        : p.health_status === 'healthy'
                          ? 'good'
                          : p.health_status
                            ? 'warn'
                            : 'neutral'
                    }
                  >
                    {/* 建表默认值是 healthy，从没探测过的渠道不能因此显示成健康。 */}
                    {isCircuitOpen ? '已熔断' : p.health_status || '未探测'}
                  </StatusBadge>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line-subtle pt-3 text-xs">
                <div>
                  <span className="text-ink-subtle">类型:</span>
                  <span className="ml-1 text-ink capitalize">{p.provider_type}</span>
                </div>
                <div>
                  <span className="text-ink-subtle">优先级:</span>
                  <span className="ml-1 font-semibold text-brand">{p.priority}</span>
                </div>
                <div>
                  <span className="text-ink-subtle">密钥:</span>
                  <span className="ml-1 text-ink">
                    {p.hasApiKey ? (
                      <span className="inline-flex items-center text-success">
                        <CheckCircle className="size-3 mr-0.5" /> 已配置
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-warning">
                        <AlertTriangle className="size-3 mr-0.5" /> 待配置
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* 探测结果提示 */}
              {probeResult && probeResult.providerId === p.id && (
                <div className={`mt-3 rounded-lg p-2.5 text-xs ${PROBE_FEEDBACK_CLASS[probeResult.type] || PROBE_FEEDBACK_CLASS.danger}`}>
                  {probeResult.text}
                </div>
              )}

              {/* 操作按钮组 */}
              <div className="mt-4 flex items-center justify-end gap-2 border-t border-line-subtle pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleEnabled(p)}
                  className="text-xs text-ink hover:text-ink"
                >
                  {p.enabled ? '禁用' : '启用'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProbeLoading}
                  onClick={() => handleTestProbe(p.id)}
                  className="text-xs border-line hover:bg-wash"
                >
                  {isProbeLoading ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      探测中...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-1 size-3 text-brand" />
                      健康探测
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setIsCreating(false);
                    setEditingProvider(p);
                  }}
                  className="text-xs border-line hover:bg-wash"
                >
                  编辑配置
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* 编辑 / 新增弹窗 */}
      {editingProvider && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-line bg-surface p-6 shadow-elevation-4">
            <h3 className="text-section-title font-semibold text-ink">
              {isCreating ? '新增 AI 供应商' : `编辑供应商: ${editingProvider.name}`}
            </h3>
            <p className="mt-1 text-body-sm text-ink-muted">
              配置驱动连接参数，API Key 写入后将通过 AES-256-GCM 独立加密。
            </p>

            <form onSubmit={handleSaveProvider} className="mt-5 space-y-4">
              <div>
                <label className="block text-label font-medium text-ink mb-1.5">供应商 ID (Slug)</label>
                <input
                  name="id"
                  defaultValue={editingProvider.id}
                  disabled={!isCreating}
                  required
                  placeholder="例如: kling, openai, custom-gateway"
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast disabled:opacity-50 font-mono"
                />
              </div>

              <div>
                <label className="block text-label font-medium text-ink mb-1.5">显示名称</label>
                <input
                  name="name"
                  defaultValue={editingProvider.name}
                  required
                  placeholder="例如: 快手可灵官方 API"
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-label font-medium text-ink mb-1.5">类型 (Provider Type)</label>
                  <select
                    name="providerType"
                    defaultValue={editingProvider.provider_type || 'aggregator'}
                    className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                  >
                    <option value="aggregator">Aggregator (聚合网关)</option>
                    <option value="official">Official (原厂官方 API)</option>
                    <option value="custom">Custom (自建私有推理集群)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-label font-medium text-ink mb-1.5">路由基础优先级 (0-200)</label>
                  <input
                    type="number"
                    name="priority"
                    defaultValue={editingProvider.priority ?? 100}
                    className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-label font-medium text-ink mb-1.5">Base URL (留空使用驱动默认)</label>
                <input
                  name="baseUrl"
                  defaultValue={editingProvider.base_url || ''}
                  placeholder="https://api.example.com/v1"
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-label font-medium text-ink mb-1.5">调用模式 (API Mode)</label>
                  <select
                    name="apiMode"
                    defaultValue={editingProvider.api_mode || 'async'}
                    className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
                  >
                    <option value="async">异步轮询 (Async)</option>
                    <option value="sync">同步直出 (Sync)</option>
                    <option value="stream">流式 (Stream)</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-body-sm text-ink cursor-pointer">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={editingProvider.enabled !== false}
                      className="size-4 rounded-xs border-line-subtle bg-well text-brand focus:ring-brand-ring"
                    />
                    启用该供应商
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-label font-medium text-ink mb-1.5">
                  API Key / Secret Token {editingProvider.hasApiKey && <span className="text-caption text-ink-subtle">(已配置，输入新值以覆盖)</span>}
                </label>
                <input
                  type="password"
                  name="apiKey"
                  placeholder={editingProvider.hasApiKey ? '••••••••••••••••' : '输入供应商 API Key'}
                  className="w-full rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast font-mono"
                />
              </div>

              <div className="mt-6 flex justify-end gap-2.5 pt-3 border-t border-line-subtle">
                <Button
                  type="button"
                  variant="secondary"
                  size="md"
                  onClick={() => {
                    setEditingProvider(null);
                    setIsCreating(false);
                  }}
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={isSaving}
                  loading={isSaving}
                >
                  保存供应商
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
