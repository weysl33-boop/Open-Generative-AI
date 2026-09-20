'use client';

import { useState, useEffect } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Shuffle, Plus, Trash2, Zap, Loader2, CheckCircle, AlertTriangle, ShieldCheck, ArrowRight } from 'lucide-react';

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
      if (res.ok && data.data?.success) {
        setTestResults((prev) => ({
          ...prev,
          [channelId]: { ok: true, text: `${data.data.message} (${data.data.latencyMs}ms)` },
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
      <Card className="p-4 border-white/[0.08] bg-[#0d0e12]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">当前配置模型:</span>
            <select
              value={selectedModelId}
              onChange={(e) => setSelectedModelId(e.target.value)}
              className="rounded-lg border border-white/[0.12] bg-[#161820] px-3 py-2 text-sm font-semibold text-white focus:border-cyan-500 focus:outline-none"
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
              className="bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold py-1.5"
            >
              <Plus className="mr-1 size-3.5" />
              添加供应商渠道
            </Button>
          </div>
        </div>
      </Card>

      {/* 核心指标 & 铁律告示 */}
      <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 p-4 flex items-start gap-3">
        <ShieldCheck className="size-5 text-cyan-400 mt-0.5 shrink-0" />
        <div className="text-xs text-gray-300 space-y-1 leading-5">
          <p className="font-semibold text-cyan-300">智能路由铁律：严格禁止跨模型降级</p>
          <p>
            前台创作者选择规范模型 <strong>{selectedModel?.display_name || selectedModelId}</strong> 后，系统仅会在下方绑定的供应商模型间进行主备切换与负载均衡。即便所有渠道均不可用，也不会降级到其它模型，确保画风、画质与物理参数绝对一致。
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* 左侧：全局策略调度配置 */}
        <Card className="lg:col-span-1 p-5 border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Shuffle className="size-4 text-cyan-400" />
              调度模式与权重
            </h3>
            <span className="text-[10px] text-gray-400 font-mono">RoutingPolicy</span>
          </div>

          {routingPolicy && (
            <form onSubmit={handleSavePolicy} className="space-y-4 text-xs">
              <div>
                <label className="block text-gray-300 font-medium mb-1.5">主路由模式</label>
                <select
                  name="routingMode"
                  defaultValue={routingPolicy.routing_mode || 'balanced'}
                  className="w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="balanced">智能平衡 (Balanced - 推荐)</option>
                  <option value="cost">成本优先 (Cost First - 最低价格)</option>
                  <option value="stability">稳定性优先 (Stability First - 高成功率)</option>
                  <option value="quality">质量优先 (Quality First - 原厂优先)</option>
                </select>
              </div>

              <div className="space-y-2 border-t border-white/[0.06] pt-3">
                <p className="text-gray-400 font-medium">评分维度权重 (0.0 - 1.0)</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-gray-500">成本权重:</span>
                    <input
                      name="wCost"
                      type="number"
                      step="0.05"
                      defaultValue={routingPolicy.weights?.cost ?? 0.4}
                      className="mt-1 w-full rounded border border-white/[0.1] bg-white/[0.03] px-2 py-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-gray-500">成功率权重:</span>
                    <input
                      name="wSuccess"
                      type="number"
                      step="0.05"
                      defaultValue={routingPolicy.weights?.success_rate ?? 0.3}
                      className="mt-1 w-full rounded border border-white/[0.1] bg-white/[0.03] px-2 py-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-gray-500">响应速度:</span>
                    <input
                      name="wSpeed"
                      type="number"
                      step="0.05"
                      defaultValue={routingPolicy.weights?.speed ?? 0.2}
                      className="mt-1 w-full rounded border border-white/[0.1] bg-white/[0.03] px-2 py-1 text-white font-mono"
                    />
                  </div>
                  <div>
                    <span className="text-gray-500">并发余量:</span>
                    <input
                      name="wCapacity"
                      type="number"
                      step="0.05"
                      defaultValue={routingPolicy.weights?.capacity ?? 0.1}
                      className="mt-1 w-full rounded border border-white/[0.1] bg-white/[0.03] px-2 py-1 text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 border-t border-white/[0.06] pt-3">
                <input
                  type="checkbox"
                  name="failoverEnabled"
                  id="failoverEnabled"
                  defaultChecked={routingPolicy.failover_enabled !== false}
                  className="size-4 rounded border-white/[0.2] bg-white/[0.05] text-cyan-500 focus:ring-0"
                />
                <label htmlFor="failoverEnabled" className="text-gray-300 cursor-pointer">
                  开启自动故障转移 (Failover)
                </label>
              </div>

              <Button
                type="submit"
                disabled={isSavingPolicy}
                className="w-full bg-white/[0.08] hover:bg-white/[0.12] text-white border border-white/[0.1]"
              >
                {isSavingPolicy ? <Loader2 className="mr-1.5 size-3.5 animate-spin" /> : null}
                保存调度策略
              </Button>
            </form>
          )}
        </Card>

        {/* 右侧：绑定渠道列表 */}
        <Card className="lg:col-span-2 p-5 border-white/[0.08] space-y-4">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
            <h3 className="text-sm font-bold text-white">
              已挂载供应商渠道 ({providerModels.length})
            </h3>
            <span className="text-xs text-gray-400">按优先级从高到低排列</span>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-gray-400">
              <Loader2 className="mx-auto size-5 animate-spin text-cyan-400 mb-2" />
              加载渠道映射中...
            </div>
          ) : providerModels.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/[0.1] py-12 text-center text-xs text-gray-400">
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
                    className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-4 hover:border-white/[0.14] transition-all space-y-3"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white text-sm">{pm.provider_name || pm.provider_id}</span>
                          <span className="font-mono text-xs text-cyan-400">[{pm.provider_model_id}]</span>
                          <StatusBadge tone={pm.enabled ? 'good' : 'neutral'}>
                            {pm.enabled ? '已启用' : '已禁用'}
                          </StatusBadge>
                        </div>
                        <p className="mt-1 text-xs text-gray-400">
                          上游 Provider: <span className="text-gray-300 font-mono">{pm.provider_id}</span> | 优先级: <strong className="text-white">{pm.priority}</strong> | 预估成本: <span className="text-emerald-400 font-mono">{pm.cost_config?.currency || '$'}{pm.cost_config?.base_cost || 0}</span>
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isTesting}
                          onClick={() => handleTestChannel(pm.id)}
                          className="text-xs border-white/[0.1] hover:bg-white/[0.05]"
                        >
                          {isTesting ? (
                            <>
                              <Loader2 className="mr-1 size-3 animate-spin" />
                              探测中...
                            </>
                          ) : (
                            <>
                              <Zap className="mr-1 size-3 text-cyan-400" />
                              一键测试
                            </>
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleChannel(pm)}
                          className="text-xs text-gray-400 hover:text-white"
                        >
                          {pm.enabled ? '禁用' : '启用'}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditingChannel(pm)}
                          className="text-xs text-cyan-400 hover:text-cyan-300"
                        >
                          编辑
                        </Button>
                        <button
                          onClick={() => handleDeleteChannel(pm.id)}
                          className="rounded p-1 text-gray-500 hover:text-red-400 transition-colors"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* 测试结果提示 */}
                    {testRes && (
                      <div
                        className={`rounded-lg p-2.5 text-xs ${
                          testRes.ok
                            ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                            : 'bg-red-500/10 text-red-400 border border-red-500/20'
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-2xl border border-white/[0.12] bg-[#0d0e12] p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white">
              {editingChannel.id ? '编辑渠道映射' : '新增供应商渠道'}
            </h3>
            <p className="mt-1 text-xs text-gray-400">
              为规范模型 <span className="text-cyan-400 font-mono">{selectedModelId}</span> 挂载物理上游驱动。
            </p>

            <form onSubmit={handleSaveChannel} className="mt-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">物理供应商</label>
                  <select
                    name="providerId"
                    defaultValue={editingChannel.provider_id || providers[0]?.id}
                    className="w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">渠道优先级 (0-200)</label>
                  <input
                    name="priority"
                    type="number"
                    defaultValue={editingChannel.priority ?? 100}
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-300 font-medium mb-1">
                  上游物理模型标识 (Provider Model ID)
                </label>
                <input
                  name="providerModelId"
                  defaultValue={editingChannel.provider_model_id || selectedModelId}
                  required
                  placeholder="例如: kling-v2-6, flux-pro, wan2.1-i2v-14b"
                  className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">超时时间 (毫秒)</label>
                  <input
                    name="timeout"
                    type="number"
                    defaultValue={editingChannel.timeout || 120000}
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">最大重试次数</label>
                  <input
                    name="maxRetries"
                    type="number"
                    defaultValue={editingChannel.max_retries ?? 2}
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-gray-300 font-medium mb-1">官方单次成本 ($/¥)</label>
                  <input
                    name="baseCost"
                    type="number"
                    step="0.001"
                    defaultValue={editingChannel.cost_config?.base_cost ?? 0.05}
                    className="w-full rounded-lg border border-white/[0.1] bg-white/[0.03] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 font-medium mb-1">货币类型</label>
                  <select
                    name="currency"
                    defaultValue={editingChannel.cost_config?.currency || 'USD'}
                    className="w-full rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-2 text-white focus:border-cyan-500 focus:outline-none"
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
                  className="size-4 rounded border-white/[0.2] bg-white/[0.05] text-cyan-500 focus:ring-0"
                />
                <label htmlFor="chEnabled" className="text-gray-300 cursor-pointer">
                  启用该供应商渠道映射
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-white/[0.08]">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setEditingChannel(null)}
                  className="text-gray-400 hover:text-white"
                >
                  取消
                </Button>
                <Button
                  type="submit"
                  disabled={isSavingChannel}
                  className="bg-cyan-500 hover:bg-cyan-400 text-black font-semibold"
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
