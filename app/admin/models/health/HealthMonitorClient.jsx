'use client';

import { useState } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { Activity, ShieldAlert, ShieldCheck, RefreshCw, Zap, Clock, AlertTriangle, Loader2 } from 'lucide-react';

const PROBE_KIND_LABEL = {
  http: 'HTTP 实测',
  credential: '仅凭据校验',
};

const FEEDBACK_TONE = {
  good: 'bg-success-soft text-success border border-success-line',
  warn: 'bg-warning-soft text-warning border border-warning-line',
  danger: 'bg-danger-soft text-danger border border-danger-line',
};

function feedbackFor(result) {
  const kind = PROBE_KIND_LABEL[result.probeKind] ?? '口径未知的探针';
  const latency = result.latencyMs === null ? '' : ` (${result.latencyMs}ms)`;
  const tone = result.healthStatus === 'healthy' ? 'good' : result.healthStatus === 'degraded' ? 'warn' : 'danger';
  return { type: tone, text: `${kind} · ${result.message || '探测无返回'}${latency}` };
}

function probeSummary(channel) {
  if (!channel.lastHealthCheckAt) return '最近探测: 未探测';
  const kind = PROBE_KIND_LABEL[channel.lastProbe?.probeKind] ?? '口径未知';
  // 仅凭据校验没有网络往返，它的 latencyMs 是 null，不能补成 0ms。
  const latency = Number.isFinite(channel.lastProbe?.latencyMs) ? ` · ${channel.lastProbe.latencyMs}ms` : '';
  return `最近探测: ${new Date(channel.lastHealthCheckAt).toLocaleTimeString()} · ${kind}${latency}`;
}

export default function HealthMonitorClient({ initialChannels = [] }) {
  const [channels, setChannels] = useState(initialChannels);
  const [probingId, setProbingId] = useState(null);
  const [resettingId, setResettingId] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isScanning, setIsScanning] = useState(false);
  const [scan, setScan] = useState(null);
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
      const result = data.data?.results?.[0];
      if (!res.ok || !result) throw new Error(data.error?.message || '探测请求失败');

      setFeedback((prev) => ({ ...prev, [providerId]: feedbackFor(result) }));
      if (result.success) await refreshList();
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

  // 全量扫描：一次批量请求交给服务端限并发执行，
  // 而不是前端串行打 N 次、每次再刷新一遍列表。
  const handleProbeAll = async () => {
    setIsScanning(true);
    setScan(null);
    try {
      const res = await fetch('/api/admin/models/health', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.data?.results) throw new Error(data.error?.message || '全量探测请求失败');

      const { summary, unknown = [], results } = data.data;
      setFeedback((prev) => ({
        ...prev,
        ...Object.fromEntries(results.map((r) => [r.providerId, feedbackFor(r)])),
      }));
      setScan({ summary, unknown });
      await refreshList();
    } catch (err) {
      setScan({ error: err.message || '网络连接异常' });
    } finally {
      setIsScanning(false);
    }
  };

  const totalChannels = channels.length;
  const openBreakers = channels.filter((c) => c.circuitState === 'circuit_open').length;
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
          <Activity className="size-4 text-brand" />
          <h2 className="text-base font-semibold text-ink">通道健康与熔断器状态</h2>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={isRefreshing}
            onClick={refreshList}
            className="text-xs border-line hover:bg-wash"
          >
            <RefreshCw className={`mr-1.5 size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            刷新状态
          </Button>
          <Button
            size="sm"
            disabled={isScanning || isRefreshing}
            onClick={handleProbeAll}
            className="bg-brand-active hover:bg-brand text-ink-on-accent text-xs font-semibold"
          >
            {isScanning ? (
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <Zap className="mr-1.5 size-3.5" />
            )}
            {isScanning ? '批量探测中...' : '全量通道探针扫描'}
          </Button>
        </div>
      </div>

      {/* 本轮扫描汇总 */}
      {scan?.error && (
        <div className="flex items-center gap-2 rounded-lg border border-danger-line bg-danger-soft p-3 text-xs text-danger">
          <AlertTriangle className="size-3.5 shrink-0" />
          {scan.error}
        </div>
      )}
      {scan?.summary && (
        <div className="rounded-lg border border-line-subtle bg-wash p-3 text-xs text-ink-muted">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5 font-semibold text-ink">
              <ShieldCheck className="size-3.5 text-brand" />
              本轮探测 {scan.summary.probed} 个渠道
            </span>
            <span className="text-success">健康 {scan.summary.healthy}</span>
            <span className="text-warning">待处理 {scan.summary.degraded}</span>
            <span className="text-danger">故障 {scan.summary.unhealthy}</span>
            {scan.summary.credentialOnly > 0 && (
              <span className="text-ink-subtle">
                其中 {scan.summary.credentialOnly} 个仅校验凭据，未实测上游连通性
              </span>
            )}
            {scan.unknown.length > 0 && (
              <span className="text-danger">未找到：{scan.unknown.join('、')}</span>
            )}
          </div>
        </div>
      )}

      {/* 通道列表 */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {channels.map((c) => {
          const isOpen = c.circuitState === 'circuit_open';
          const isHalfOpen = c.circuitState === 'half_open';
          const isProbing = probingId === c.id;
          const isResetting = resettingId === c.id;
          const msg = feedback[c.id];

          return (
            <Card
              key={c.id}
              className={`p-5 border-line transition-all space-y-4 ${
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
                    <span className="font-mono text-xs text-ink-muted">[{c.id}]</span>
                    <h3 className="text-base font-semibold text-ink">{c.name}</h3>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted font-mono truncate max-w-xs">
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
              <div className="grid grid-cols-3 gap-2 rounded-xl border border-line-subtle bg-wash p-3 text-xs">
                <div>
                  <p className="text-ink-subtle">24h 成功率</p>
                  {/* 没有样本不是 0%，也不是 100%：空表冒填会让管理员误判渠道健康。 */}
                  <p
                    className={`mt-1 font-mono font-bold ${
                      c.successRate24h === null
                        ? 'text-ink-subtle'
                        : c.successRate24h >= 95
                          ? 'text-success'
                          : 'text-warning'
                    }`}
                  >
                    {c.successRate24h === null ? '—' : `${c.successRate24h}%`}
                  </p>
                  <p className="text-micro text-ink-subtle">共 {c.totalAttempts24h} 次调用</p>
                </div>

                <div>
                  <p className="text-ink-subtle">平均耗时</p>
                  <p className="mt-1 font-mono font-bold text-ink">
                    {c.avgLatencyMs24h === null ? '—' : `${c.avgLatencyMs24h} ms`}
                  </p>
                  <p className="text-micro text-ink-subtle">挂载 {c.boundModelsCount} 个模型</p>
                </div>

                <div>
                  <p className="text-ink-subtle">连续失败计数</p>
                  <p className={`mt-1 font-mono font-bold ${c.consecutiveFailures > 0 ? 'text-danger' : 'text-ink-muted'}`}>
                    {c.consecutiveFailures} 次
                  </p>
                  <p className="text-micro text-ink-subtle">阈值: 5 次</p>
                </div>
              </div>

              {/* 探测信息反馈 */}
              {msg && (
                <div className={`rounded-lg p-2.5 text-xs ${FEEDBACK_TONE[msg.type] || FEEDBACK_TONE.danger}`}>
                  {msg.text}
                </div>
              )}

              {/* 底部操作 */}
              <div className="flex items-center justify-between border-t border-line-subtle pt-3 text-xs">
                <span className="text-ink-subtle flex items-center gap-1">
                  <Clock className="size-3" />
                  {probeSummary(c)}
                </span>

                <div className="flex items-center gap-2">
                  {(isOpen || isHalfOpen || c.consecutiveFailures > 0) && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isResetting}
                      onClick={() => handleResetCircuit(c.id)}
                      className="text-xs border-warning-line text-warning hover:bg-warning-soft"
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
                    className="text-xs border-line hover:bg-wash"
                  >
                    {isProbing ? (
                      <>
                        <Loader2 className="mr-1 size-3 animate-spin" />
                        探测中...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-1 size-3 text-brand" />
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
