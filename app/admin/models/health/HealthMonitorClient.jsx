'use client';

import { useState } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Activity, ShieldAlert, ShieldCheck, RefreshCw, Zap, Clock, AlertTriangle, Loader2 } from 'lucide-react';

export default function HealthMonitorClient({ initialChannels = [] }) {
  const [channels, setChannels] = useState(initialChannels);
  const [probingId, setProbingId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [feedback, setFeedback] = useState({});

  // 刷新最新列表
  const refreshList = async () => {
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/admin/models/health');
      const json = await res.json();
      if (res.ok && json.data?.channels) {
        setChannels(json.data.channels);
      }
    } catch (err) {
      console.error('刷新状态失败:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  // 单独执行探测
  const handleProbe = async (providerId) => {
    setProbingId(providerId);
    try {
      const res = await fetch('/api/admin/models/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const data = await res.json();
      if (res.ok && data.data?.success) {
        setFeedback((prev) => ({
          ...prev,
          [providerId]: { type: 'good', text: `${data.data.message} (${data.data.latencyMs}ms)` },
        }));
        await refreshList();
      } else {
        setFeedback((prev) => ({
          ...prev,
          [providerId]: { type: 'danger', text: data.data?.message || data.error?.message || '探测失败' },
        }));
      }
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [providerId]: { type: 'danger', text: err.message || '网络连接异常' },
      }));
    } finally {
      setProbingId(null);
    }
  };

  // 重置熔断器
  const handleResetCircuit = async (providerId) => {
    setResettingId(providerId);
    try {
      const res = await fetch('/api/admin/models/health/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ providerId }),
      });
      const data = await res.json();
      if (res.ok) {
        setFeedback((prev) => ({
          ...prev,
          [providerId]: { type: 'good', text: '熔断器已成功复位闭合 (Closed)' },
        }));
        await refreshList();
      } else {
        setFeedback((prev) => ({
          ...prev,
          [providerId]: { type: 'danger', text: data.error?.message || '重置失败' },
        }));
      }
    } catch (err) {
      setFeedback((prev) => ({
        ...prev,
        [providerId]: { type: 'danger', text: err.message || '网络异常' },
      }));
    } finally {
      setResettingId(null);
    }
  };

  // 全量扫描
  const handleProbeAll = async () => {
    setIsRefreshing(true);
    for (const c of channels) {
      await handleProbe(c.id);
    }
    setIsRefreshing(false);
  };

  const totalChannels = channels.length;
  const openBreakers = channels.filter((c) => c.circuitState === 'open').length;
  const halfOpenBreakers = channels.filter((c) => c.circuitState === 'half_open').length;
  const closedBreakers = channels.filter((c) => c.circuitState === 'closed').length;

  return (
    <div className="space-y-6">
      {/* 顶部指标 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard label="监控供应商通道数" value={totalChannels} hint="覆盖所有物理集成渠道" tone="info" />
        <MetricCard label="闭合正常 (Closed)" value={closedBreakers} hint="正常承接路由流量" tone="good" />
        <MetricCard
          label="触发熔断 (Open)"
          value={openBreakers}
          hint="连续失败已触发熔断保护"
          tone={openBreakers > 0 ? 'danger' : 'neutral'}
        />
        <MetricCard
          label="半开试验 (Half-Open)"
          value={halfOpenBreakers}
          hint="冷却期后小流量试探中"
          tone={halfOpenBreakers > 0 ? 'warn' : 'neutral'}
        />
      </div>

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-cyan-400" />
          <h2 className="text-base font-semibold text-white">通道健康与熔断器状态</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={refreshList}
            className="text-xs border-white/[0.1] hover:bg-white/[0.05]"
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新状态
          </Button>
          <Button
            size="sm"
            disabled={isRefreshing}
            onClick={handleProbeAll}
            className="bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-semibold"
          >
            <Zap className="mr-1.5 size-3.5" />
            全量通道探针扫描
          </Button>
        </div>
      </div>

      {/* 通道列表 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {channels.map((c) => {
          const isOpen = c.circuitState === 'open';
          const isHalfOpen = c.circuitState === 'half_open';
          const isProbing = probingId === c.id;
          const isResetting = resettingId === c.id;
          const msg = feedback[c.id];

          return (
            <Card
              key={c.id}
              className={`p-5 border-white/[0.08] transition-all space-y-4 ${
                isOpen
                  ? 'border-red-500/40 bg-red-950/10'
                  : isHalfOpen
                  ? 'border-amber-500/30 bg-amber-950/10'
                  : 'hover:border-white/[0.14]'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-gray-400">[{c.id}]</span>
                    <h3 className="text-base font-semibold text-white">{c.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-gray-400 font-mono truncate max-w-xs">
                    {c.baseUrl || '官方默认 Endpoint'}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <StatusBadge tone={isOpen ? 'danger' : isHalfOpen ? 'warn' : 'good'}>
                    {isOpen ? '🔴 熔断阻断 (Open)' : isHalfOpen ? '🟡 半开试探 (Half-Open)' : '🟢 闭合正常 (Closed)'}
                  </StatusBadge>
                </div>
              </div>

              {/* 指标矩阵 */}
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs">
                <div>
                  <p className="text-gray-500">24h 成功率</p>
                  <p className={`mt-1 font-mono font-bold ${c.successRate24h >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
                    {c.successRate24h}%
                  </p>
                  <p className="text-[10px] text-gray-500">共 {c.totalAttempts24h} 次调用</p>
                </div>

                <div>
                  <p className="text-gray-500">平均耗时</p>
                  <p className="mt-1 font-mono font-bold text-white">{c.avgLatencyMs24h} ms</p>
                  <p className="text-[10px] text-gray-500">挂载 {c.boundModelsCount} 个模型</p>
                </div>

                <div>
                  <p className="text-gray-500">连续失败计数</p>
                  <p className={`mt-1 font-mono font-bold ${c.consecutiveFailures > 0 ? 'text-red-400' : 'text-gray-400'}`}>
                    {c.consecutiveFailures} 次
                  </p>
                  <p className="text-[10px] text-gray-500">阈值: 5 次</p>
                </div>
              </div>

              {/* 探测信息反馈 */}
              {msg && (
                <div
                  className={`rounded-lg p-2.5 text-xs ${
                    msg.type === 'good'
                      ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                      : 'bg-red-500/10 text-red-400 border border-red-500/20'
                  }`}
                >
                  {msg.text}
                </div>
              )}

              {/* 底部操作 */}
              <div className="flex items-center justify-between border-t border-white/[0.06] pt-3 text-xs">
                <span className="text-gray-500 flex items-center gap-1">
                  <Clock className="size-3" />
                  最近探测: {c.lastHealthCheckAt ? new Date(c.lastHealthCheckAt).toLocaleTimeString() : '未探测'}
                </span>

                <div className="flex items-center gap-2">
                  {(isOpen || isHalfOpen || c.consecutiveFailures > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isResetting}
                      onClick={() => handleResetCircuit(c.id)}
                      className="text-xs border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                    >
                      {isResetting ? <Loader2 className="mr-1 size-3 animate-spin" /> : null}
                      复位熔断器
                    </Button>
                  )}

                  <Button
                    variant="outline"
                    size="sm"
                    disabled={isProbing}
                    onClick={() => handleProbe(c.id)}
                    className="text-xs border-white/[0.1] hover:bg-white/[0.05]"
                  >
                    {isProbing ? (
                      <>
                        <Loader2 className="mr-1 size-3 animate-spin" />
                        探测中...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-1 size-3 text-cyan-400" />
                        探测心跳
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
