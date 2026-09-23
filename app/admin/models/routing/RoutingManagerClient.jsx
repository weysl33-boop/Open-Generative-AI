'use client';

import { useState, useEffect } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Shuffle, Plus, Trash2, Zap, Loader2, CheckCircle, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';
import { probeFeedback } from '@/lib/modelCenter/view';

export default function RoutingManagerClient({ initialModels = [], initialProviders = [] }) {
  const [models] = useState(initialModels);
  const [providers] = useState(initialProviders);
  const [selectedModelId, setSelectedModelId] = useState(initialModels[0]?.id || '');
  
  const [loading, setLoading] = useState(false);
  const [providerModels, setProviderModels] = useState([]);
  const [routingPolicy, setRoutingPolicy] = useState(null);
  const [testResults, setTestResults] = useState({});
  const [testingChannelId, setTestingChannelId] = useState(null);

  const [editingChannel, setEditingChannel] = useState(null);
  const [isSavingChannel, setIsSavingChannel] = useState(false);
  const [isSavingPolicy, setIsSavingPolicy] = useState(false);

  // 加载所选模型的渠道与策略
  const loadModelDetails = async (mId) => {
    if (!mId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/models/routing?modelId=${encodeURIComponent(mId)}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setProviderModels(json.data.providerModels || []);
        setRoutingPolicy(json.data.routingPolicy || null);
      }
    } catch (err) {
      console.error('加载模型路由数据失败:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedModelId) {
      loadModelDetails(selectedModelId);
    }
  }, [selectedModelId]);

  // 测试通道
  const handleTestChannel = async (channelId) => {
    setTestingChannelId(channelId);
    try {
      const res = await fetch('/api/admin/models/routing/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const data = await res.json();
      if (res.ok && data.data) {
        // 探测结论由服务端归一化：口径（HTTP 实测 / 仅凭据）与是否健康都要如实复述，
        // 不能只看 HTTP 200 就说成功——上游 503 也是一次成功的探测。
        const feedback = probeFeedback(data.data);
        setTestResults((prev) => ({
          ...prev,
          [channelId]: { ok: feedback.tone === 'success', text: feedback.text },
        }));
      } else {
        setTestResults((prev) => ({
          ...prev,
          [channelId]: { ok: false, text: data.data?.message || data.error?.message || '测试失败' },
        }));
      }
    } catch (err) {
      setTestResults((prev) => ({
        ...prev,
        [channelId]: { ok: false, text: err.message || '网络请求超时' },
      }));
    } finally {
      setTestingChannelId(null);
    }
  };

  // 切换渠道启用
  const handleToggleChannel = async (channel) => {
    const nextEnabled = !channel.enabled;
    try {
      const res = await fetch('/api/admin/models/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'provider_model',
          data: {
            id: channel.id,
            model_id: channel.model_id,
            provider_id: channel.provider_id,
            provider_model_id: channel.provider_model_id,
            priority: channel.priority,
            enabled: nextEnabled,
          },
        }),
      });
      if (res.ok) {
        setProviderModels((prev) =>
          prev.map((pm) => (pm.id === channel.id ? { ...pm, enabled: nextEnabled } : pm))
        );
      }
    } catch (err) {
      alert('切换渠道失败: ' + err.message);
    }
  };

  // 保存路由策略
  const handleSavePolicy = async (e) => {
    e.preventDefault();
    setIsSavingPolicy(true);
    const form = e.target;
    const mode = form.routingMode.value;

    const payload = {
      type: 'policy',
      data: {
        model_id: selectedModelId,
        routing_mode: mode,
        failover_enabled: form.failoverEnabled.checked,
        weights: {
          cost: Number(form.wCost.value || 0.4),
          success_rate: Number(form.wSuccess.value || 0.3),
          speed: Number(form.wSpeed.value || 0.2),
          capacity: Number(form.wCapacity.value || 0.1),
        },
      },
    };

    try {
      const res = await fetch('/api/admin/models/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        alert('路由调度策略更新成功');
      } else {
        const d = await res.json();
        alert(d.error?.message || '更新策略失败');
      }
    } catch (err) {
      alert('更新策略异常: ' + err.message);
    } finally {
      setIsSavingPolicy(false);
    }
  };

  // 保存新增/修改渠道
  const handleSaveChannel = async (e) => {
    e.preventDefault();
    setIsSavingChannel(true);
    const form = e.target;

    const payload = {
      type: 'provider_model',
      data: {
        id: editingChannel.id || undefined,
        model_id: selectedModelId,
        provider_id: form.providerId.value,
        provider_model_id: form.providerModelId.value.trim(),
        priority: Number(form.priority.value || 100),
        timeout: Number(form.timeout.value || 120000),
        max_retries: Number(form.maxRetries.value || 2),
        cost_config: {
          currency: form.currency.value,
          base_cost: Number(form.baseCost.value || 0),
        },
        enabled: form.enabled.checked,
      },
    };

    try {
      const res = await fetch('/api/admin/models/routing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        const saved = data.data.providerModel;
        setProviderModels((prev) => {
          const idx = prev.findIndex((p) => p.id === saved.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...saved };
            return next;
          }
          return [...prev, saved];
        });
        setEditingChannel(null);
      } else {
        alert(data.error?.message || '保存渠道映射失败');
      }
    } catch (err) {
      alert('保存出错: ' + err.message);
    } finally {
      setIsSavingChannel(false);
    }
  };

  const handleDeleteChannel = async (channelId) => {
    if (!confirm('确定要移除该供应商渠道映射吗？')) return;
    try {
      const res = await fetch(`/api/admin/models/routing?id=${encodeURIComponent(channelId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setProviderModels((prev) => prev.filter((p) => p.id !== channelId));
      }
    } catch (err) {
      alert('删除失败: ' + err.message);
    }
  };

  const selectedModel = models.find((m) => m.id === selectedModelId);

  return (
    <div className="space-y-6">
      {/* 模型选择栏 */}
      <Card className="p-4 border-line-subtle bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-body-xs font-semibold uppercase tracking-wider text-ink-muted">当前配置模型:</span>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm font-semibold text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.name} ({m.id}) - {m.category}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => {
                setEditingChannel({
                  id: '',
                  model_id: selectedModelId,
                  provider_id: providers[0]?.id || 'muapi',
                  provider_model_id: selectedModelId,
                  priority: 100,
                  timeout: 120000,
                  max_retries: 2,
                  cost_config: { currency: 'USD', base_cost: 0.05 },
                  enabled: true,
                });
              }}
              className="h-control-sm rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active text-ink-on-accent text-body-xs font-semibold px-3"
            >
              <Plus className="mr-1 size-3.5" />
              添加供应商渠道
            </Button>
          </div>
        </div>
      </Card>

      {/* 核心指标 & 铁律告示 */}
      <div className="rounded-xl border border-brand-line bg-brand-soft p-4 flex items-start gap-3">
        <ShieldCheck className="size-5 text-brand mt-0.5 shrink-0" />
        <div className="text-body-xs text-ink space-y-1 leading-5">
          <p className="font-semibold text-brand-hover">智能路由铁律：严格禁止跨模型降级</p>
          <p className="text-ink-muted">
            前台创作者选择规范模型 <strong className="text-ink">{selectedModel?.display_name || selectedModelId}</strong> 后，系统仅会在下方绑定的供应商模型间进行主备切换与负载均衡。即便所有渠道均不可用，也不会降级到其它模型，确保画风、画质与物理参数绝对一致。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左侧：全局策略调度配置 */}
        <Card className="lg:col-span-1 p-5 border-line-subtle space-y-4">
          <div className="flex items-center justify-between border-b border-line-subtle pb-3">
            <h3 className="text-body-sm font-bold text-ink flex items-center gap-1.5">
              <Shuffle className="size-4 text-brand" />
              调度模式与权重
            </h3>
            <span className="text-micro text-ink-muted font-mono">RoutingPolicy</span>
          </div>

          {routingPolicy && (
            <form onSubmit={handleSavePolicy} className="space-y-4 text-body-xs">
              <div>
                <label className="block text-ink font-medium mb-1.5">主路由模式</label>
                <select
                  name="routingMode"
                  defaultValue={routingPolicy.routing_mode || 'balanced'}
                  className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                >
                  <option value="balanced">智能平衡 (Balanced - 推荐)</option>
                  <option value="cost">成本优先 (Cost First - 最低价格)</option>
                  <option value="stability">稳定性优先 (Stability First - 高成功率)</option>
                  <option value="quality">质量优先 (Quality First - 原厂优先)</option>
                </select>
              </div>

              <div className="space-y-2 border-t border-line-subtle pt-3">
                <p className="text-ink-muted font-medium">评分维度权重 (0.0 - 1.0)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-ink-subtle">成本权重:</span>
                    <input
                      name="wCost"
                      type="number"
                      step="0.05"
                      defaultValue={routingPolicy.weights?.cost ?? 0.4}
                      className="mt-1 w-full h-control-sm rounded-md border border-line-subtle bg-well px-2.5 text-body-xs text-ink font-mono focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                    />
                  </div>
                  <div>
                    <span className="text-ink-subtle">成功率权重:</span>
                    <input
                      name="wSuccess"
                      type="number"
                      step="0.05"
                      defaultValue={routingPolicy.weights?.success_rate ?? 0.3}
                      className="mt-1 w-full h-control-sm rounded-md border border-line-subtle bg-well px-2.5 text-body-xs text-ink font-mono focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                    />
                  </div>
                  <div>
                    <span className="text-ink-subtle">响应速度:</span>
                    <input
                      name="wSpeed"
                      type="number"
                      step="0.05"
                      defaultValue={routingPolicy.weights?.speed ?? 0.2}
                      className="mt-1 w-full h-control-sm rounded-md border border-line-subtle bg-well px-2.5 text-body-xs text-ink font-mono focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                    />
                  </div>
                  <div>
                    <span className="text-ink-subtle">并发余量:</span>
                    <input
                      name="wCapacity"
                      type="number"
                      step="0.05"
                      defaultValue={routingPolicy.weights?.capacity ?? 0.1}
                      className="mt-1 w-full h-control-sm rounded-md border border-line-subtle bg-well px-2.5 text-body-xs text-ink font-mono focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-line-subtle pt-3">
                <input
                  type="checkbox"
                  name="failoverEnabled"
                  id="failoverEnabled"
                  defaultChecked={routingPolicy.failover_enabled !== false}
                  className="size-4 rounded border-line-strong bg-well text-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
                />
                <label htmlFor="failoverEnabled" className="text-ink cursor-pointer select-none">
                  开启自动故障转移 (Failover)
                </label>
              </div>

              <Button
                type="submit"
                disabled={isSavingPolicy}
                className="w-full h-control-md rounded-md bg-raised hover:bg-raised-hover text-label border border-line-subtle font-medium text-body-xs transition-colors"
              >
                {isSavingPolicy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                保存调度策略
              </Button>
            </form>
          )}
        </Card>

        {/* 右侧：绑定渠道列表 */}
        <Card className="lg:col-span-2 p-5 border-line-subtle space-y-4">
          <div className="flex items-center justify-between border-b border-line-subtle pb-3">
            <h3 className="text-body-sm font-bold text-ink">
              已挂载供应商渠道 ({providerModels.length})
            </h3>
            <span className="text-body-xs text-ink-muted">按优先级从高到低排列</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-body-xs text-ink-muted">
              <Loader2 className="mx-auto size-5 animate-spin text-brand mb-2" />
              加载渠道映射中...
            </div>
          ) : providerModels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-line-subtle py-12 text-center text-body-xs text-ink-muted">
              该模型暂未挂载任何供应商渠道，任务生成将报错。请点击右上角「添加供应商渠道」。
            </div>
          ) : (
            <div className="space-y-3">
              {providerModels.map((pm) => {
                const isTesting = testingChannelId === pm.id;
                const testRes = testResults[pm.id];

                return (
                  <div
                    key={pm.id}
                    className="rounded-xl border border-line-subtle bg-well p-4 hover:border-line-strong transition-colors space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-ink text-body-sm">{pm.provider_name || pm.provider_id}</span>
                          <span className="font-mono text-body-xs text-brand">[{pm.provider_model_id}]</span>
                          <StatusBadge tone={pm.enabled ? 'good' : 'neutral'}>
                            {pm.enabled ? '已启用' : '已禁用'}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-body-xs text-ink-muted">
                          上游 Provider: <span className="text-ink font-mono">{pm.provider_id}</span> | 优先级: <strong className="text-ink">{pm.priority}</strong> | 预估成本: <span className="text-good font-mono">{pm.cost_config?.currency || '$'}{pm.cost_config?.base_cost || 0}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isTesting}
                          onClick={() => handleTestChannel(pm.id)}
                          className="h-control-sm text-body-xs border-line-subtle bg-raised hover:bg-raised-hover text-label"
                        >
                          {isTesting ? (
                            <>
                              <Loader2 className="mr-1 size-3 animate-spin" />
                              探测中...
                            </>
                          ) : (
                            <>
                              <Zap className="mr-1 size-3 text-brand" />
                              一键测试
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleChannel(pm)}
                          className="h-control-sm text-body-xs text-ink-muted hover:text-ink"
                        >
                          {pm.enabled ? '禁用' : '启用'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingChannel(pm)}
                          className="h-control-sm text-body-xs text-brand hover:text-brand-hover"
                        >
                          编辑
                        </Button>
                        <button
                          onClick={() => handleDeleteChannel(pm.id)}
                          className="rounded p-1 text-ink-subtle hover:text-danger transition-colors"
                          aria-label="删除">
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 测试结果提示 */}
                    {testRes && (
                      <div
                        className={`rounded-md p-2.5 text-body-xs ${
                          testRes.ok
                            ? 'bg-good-soft text-good border border-good-line'
                            : 'bg-danger-soft text-danger border border-danger-line'
                        }`}
                      >
                        {testRes.text}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>

      {/* 弹窗：编辑/添加渠道 */}
      {editingChannel && (
        <div className="fixed inset-0 z-modal flex items-center justify-center bg-scrim p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-xl border border-line-subtle bg-surface p-6 shadow-elevation-4">
            <h3 className="text-body-lg font-bold text-ink">
              {editingChannel.id ? '编辑渠道映射' : '新增供应商渠道'}
            </h3>
            <p className="mt-1 text-body-xs text-ink-muted">
              为规范模型 <span className="text-brand font-mono">{selectedModelId}</span> 挂载物理上游驱动。
            </p>

            <form onSubmit={handleSaveChannel} className="mt-5 space-y-4 text-body-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-ink font-medium mb-1">物理供应商</label>
                  <select
                    name="providerId"
                    defaultValue={editingChannel.provider_id || providers[0]?.id}
                    className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-ink font-medium mb-1">渠道优先级 (0-200)</label>
                  <input
                    name="priority"
                    type="number"
                    defaultValue={editingChannel.priority ?? 100}
                    className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-ink font-medium mb-1">
                  上游物理模型标识 (Provider Model ID)
                </label>
                <input
                  name="providerModelId"
                  defaultValue={editingChannel.provider_model_id || selectedModelId}
                  required
                  placeholder="例如: kling-v2-6, flux-pro, wan2.1-i2v-14b"
                  className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink placeholder:text-ink-subtle focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-ink font-medium mb-1">超时时间 (毫秒)</label>
                  <input
                    name="timeout"
                    type="number"
                    defaultValue={editingChannel.timeout || 120000}
                    className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring font-mono"
                  />
                </div>
                <div>
                  <label className="block text-ink font-medium mb-1">最大重试次数</label>
                  <input
                    name="maxRetries"
                    type="number"
                    defaultValue={editingChannel.max_retries ?? 2}
                    className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-ink font-medium mb-1">官方单次成本 ($/¥)</label>
                  <input
                    name="baseCost"
                    type="number"
                    step="0.001"
                    defaultValue={editingChannel.cost_config?.base_cost ?? 0.05}
                    className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring font-mono"
                  />
                </div>
                <div>
                  <label className="block text-ink font-medium mb-1">货币类型</label>
                  <select
                    name="currency"
                    defaultValue={editingChannel.cost_config?.currency || 'USD'}
                    className="w-full h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
                  >
                    <option value="USD">USD ($)</option>
                    <option value="CNY">CNY (¥)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  name="enabled"
                  id="chEnabled"
                  defaultChecked={editingChannel.enabled !== false}
                  className="size-4 rounded border-line-strong bg-well text-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
                />
                <label htmlFor="chEnabled" className="text-ink cursor-pointer select-none">
                  启用该供应商渠道映射
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-line-subtle">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingChannel(null)}
                  className="h-control-md text-ink-muted hover:text-ink px-4 text-body-sm"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingChannel}
                  className="h-control-md rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active text-ink-on-accent font-semibold px-4 text-body-sm transition-colors"
                >
                  {isSavingChannel ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                  保存渠道
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
