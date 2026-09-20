'use client';

import { useState } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Server, Key, ShieldCheck, Zap, Plus, CheckCircle, XCircle, AlertTriangle, Loader2 } from 'lucide-react';

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
  const openCircuitCount = providers.filter((p) => p.circuit_state === 'open').length;

  const handleTestProbe = async (providerId) => {
    setProbeLoadingId(providerId);
    setProbeResult(null);
    try {
      const res = await fetch('/api/admin/models/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const data = await res.json();
      if (res.ok && data.data?.success) {
        setProbeResult({ providerId, type: 'good', text: `${data.data.message} (${data.data.latencyMs}ms)` });
      } else {
        setProbeResult({ providerId, type: 'danger', text: data.data?.message || data.error?.message || '探测失败' });
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
        <h2 className="text-lg font-semibold text-white">AI 供应商列表</h2>
        <Button
          onClick={() => {
            setIsCreating(true);
            setEditingProvider({
              id: '',
              name: '',
              provider_type: 'aggregator',
              priority: 100,
              base_url: '',
              api_mode: 'async_poll',
              enabled: true,
            });
          }}
          className="bg-cyan-500 hover:bg-cyan-400 text-black font-medium"
        >
          <Plus className="mr-1.5 size-4" />
          新增供应商
        </Button>
      </div>

      {/* 供应商卡片列表 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {providers.map((p) => {
          const isProbeLoading = probeLoadingId === p.id;
          const isCircuitOpen = p.circuit_state === 'open';

          return (
            <Card key={p.id} className="relative overflow-hidden border-white/[0.08] hover:border-white/[0.16] transition-all">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">[{p.id}]</span>
                    <h3 className="text-base font-semibold text-white">{p.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 font-mono truncate max-w-xs">
                    {p.base_url || '官方默认 Endpoint'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge tone={p.enabled ? 'good' : 'neutral'}>
                    {p.enabled ? '已启用' : '已禁用'}
                  </StatusBadge>
                  <StatusBadge tone={isCircuitOpen ? 'danger' : p.health_status === 'healthy' ? 'good' : 'warn'}>
                    {isCircuitOpen ? '已熔断' : p.health_status || '健康'}
                  </StatusBadge>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/[0.06] pt-3 text-xs">
                <div>
                  <span className="text-gray-500">类型:</span>
                  <span className="ml-1 text-gray-300 capitalize">{p.provider_type}</span>
                </div>
                <div>
                  <span className="text-gray-500">优先级:</span>
                  <span className="ml-1 font-semibold text-cyan-400">{p.priority}</span>
                </div>
                <div>
                  <span className="text-gray-500">密钥:</span>
                  <span className="ml-1 text-gray-300">
                    {p.hasApiKey ? (
                      <span className="inline-flex items-center text-emerald-400">
                        <CheckCircle className="size-3 mr-0.5" /> 已配置
                      </span>
                    ) : (
                      <span className="inline-flex items-center text-amber-400">
                        <AlertTriangle className="size-3 mr-0.5" /> 待配置
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* 探测结果提示 */}
              {probeResult && probeResult.providerId === p.id && (
                <div className={`mt-3 rounded-lg p-2.5 text-xs ${probeResult.type === 'good' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  {probeResult.text}
                </div>
              )}

              {/* 操作按钮组 */}
              <div className="mt-4 flex items-center justify-end gap-2 border-t border-white/[0.06] pt-3">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleToggleEnabled(p)}
                  className="text-xs text-gray-300 hover:text-white"
                >
                  {p.enabled ? '禁用' : '启用'}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isProbeLoading}
                  onClick={() => handleTestProbe(p.id)}
                  className="text-xs border-white/[0.1] hover:bg-white/[0.05]"
                >
                  {isProbeLoading ? (
                    <>
                      <Loader2 className="mr-1 size-3 animate-spin" />
                      探测中...
                    </>
                  ) : (
                    <>
                      <Zap className="mr-1 size-3 text-cyan-400" />
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
                  className="text-xs border-white/[0.1] hover:bg-white/[0.05]"
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#0d0e12] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              {isCreating ? '新增 AI 供应商' : `编辑供应商: ${editingProvider.name}`}
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              配置驱动连接参数，API Key 写入后将通过 AES-256-GCM 独立加密。
            </p>

            <form onSubmit={handleSaveProvider} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-300">供应商 ID (Slug)</label>
                <input
                  name="id"
                  defaultValue={editingProvider.id}
                  disabled={!isCreating}
                  required
                  placeholder="例如: kling, openai, custom-gateway"
                  className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none disabled:opacity-50 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300">显示名称</label>
                <input
                  name="name"
                  defaultValue={editingProvider.name}
                  required
                  placeholder="例如: 快手可灵官方 API"
                  className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300">类型 (Provider Type)</label>
                  <select
                    name="providerType"
                    defaultValue={editingProvider.provider_type || 'aggregator'}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="aggregator">Aggregator (聚合网关)</option>
                    <option value="official">Official (原厂官方 API)</option>
                    <option value="custom">Custom (自建私有推理集群)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300">路由基础优先级 (0-200)</label>
                  <input
                    type="number"
                    name="priority"
                    defaultValue={editingProvider.priority ?? 100}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300">Base URL (留空使用驱动默认)</label>
                <input
                  name="baseUrl"
                  defaultValue={editingProvider.base_url || ''}
                  placeholder="https://api.example.com/v1"
                  className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-300">调用模式 (API Mode)</label>
                  <select
                    name="apiMode"
                    defaultValue={editingProvider.api_mode || 'async_poll'}
                    className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none"
                  >
                    <option value="async_poll">异步轮询 (Async Poll)</option>
                    <option value="sync_direct">同步直出 (Sync Direct)</option>
                    <option value="webhook">异步回调 (Webhook)</option>
                  </select>
                </div>
                <div className="flex items-end pb-2">
                  <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                    <input
                      type="checkbox"
                      name="enabled"
                      defaultChecked={editingProvider.enabled !== false}
                      className="size-4 rounded border-white/[0.2] bg-white/[0.05] text-cyan-500 focus:ring-0"
                    />
                    启用该供应商
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-300">
                  API Key / Secret Token {editingProvider.hasApiKey && <span className="text-gray-500">(已配置，输入新值以覆盖)</span>}
                </label>
                <input
                  type="password"
                  name="apiKey"
                  placeholder={editingProvider.hasApiKey ? '••••••••••••••••' : '输入供应商 API Key'}
                  className="mt-1.5 w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-sm text-white focus:border-cyan-500 focus:outline-none font-mono"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-white/[0.08]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    setEditingProvider(null);
                    setIsCreating(false);
                  }}
                  className="text-gray-400 hover:text-white"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSaving}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
                >
                  {isSaving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                  保存配置
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
