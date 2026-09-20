'use client';

import { useState } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { DollarSign, Activity, Server, AlertTriangle, Filter, Calendar, Loader2, ArrowUpRight } from 'lucide-react';

export default function CostCenterClient({ initialData, providers = [], models = [] }) {
  const [data, setData] = useState(initialData);
  const [selectedProvider, setSelectedProvider] = useState('');
  const [selectedModel, setSelectedModel] = useState('');
  const [dateRange, setDateRange] = useState('30d');
  const [isLoading, setIsLoading] = useState(false);

  const fetchFilteredData = async (providerId, modelId, range) => {
    setIsLoading(true);
    try {
      let startDate = null;
      const now = new Date();
      if (range === '7d') {
        startDate = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();
      } else if (range === '14d') {
        startDate = new Date(now.getTime() - 14 * 24 * 3600 * 1000).toISOString();
      } else if (range === '30d') {
        startDate = new Date(now.getTime() - 30 * 24 * 3600 * 1000).toISOString();
      }

      const params = new URLSearchParams();
      if (startDate) params.set('startDate', startDate);
      if (providerId) params.set('providerId', providerId);
      if (modelId) params.set('modelId', modelId);

      const res = await fetch(`/api/admin/analytics/cost?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error('获取成本数据失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleProviderChange = (e) => {
    const val = e.target.value;
    setSelectedProvider(val);
    fetchFilteredData(val, selectedModel, dateRange);
  };

  const handleModelChange = (e) => {
    const val = e.target.value;
    setSelectedModel(val);
    fetchFilteredData(selectedProvider, val, dateRange);
  };

  const handleDateRangeChange = (val) => {
    setDateRange(val);
    fetchFilteredData(selectedProvider, selectedModel, val);
  };

  const summary = data?.summary || {};

  return (
    <div className="space-y-6">
      {/* 筛选控制器 */}
      <Card className="p-4 border-white/[0.08] bg-[#0d0e12]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Filter className="size-3.5 text-cyan-400" />
              <span>筛选过滤:</span>
            </div>

            {/* 供应商选择 */}
            <select
              value={selectedProvider}
              onChange={handleProviderChange}
              className="rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="">全部供应商 (All Providers)</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.id})
                </option>
              ))}
            </select>

            {/* 模型选择 */}
            <select
              value={selectedModel}
              onChange={handleModelChange}
              className="rounded-lg border border-white/[0.1] bg-[#161820] px-3 py-1.5 text-xs text-white focus:border-cyan-500 focus:outline-none"
            >
              <option value="">全部规范模型 (All Models)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.name} ({m.id})
                </option>
              ))}
            </select>
          </div>

          {/* 时间范围快速切换 */}
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-lg border border-white/[0.06]">
            {[
              { id: '7d', label: '近 7 天' },
              { id: '14d', label: '近 14 天' },
              { id: '30d', label: '近 30 天' },
              { id: 'all', label: '全部历史' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => handleDateRangeChange(r.id)}
                className={`rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  dateRange === r.id
                    ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* KPI 指标卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard
          label="真实 API 总支出 (USD)"
          value={`$${summary.totalCostUsd?.toFixed(4) || '0.0000'}`}
          hint={`折合人民币: ¥${summary.totalCostCny?.toFixed(2) || '0.00'}`}
          tone="danger"
        />
        <MetricCard
          label="供应商调用总次数"
          value={summary.totalCalls || 0}
          hint={`成功: ${summary.successCalls || 0} / 失败: ${summary.failedCalls || 0}`}
          tone="info"
        />
        <MetricCard
          label="物理调用成功率"
          value={`${summary.successRate || 100}%`}
          hint="跨渠道平均可用性"
          tone={summary.successRate >= 95 ? 'good' : 'warn'}
        />
        <MetricCard
          label="平均请求耗时"
          value={`${summary.avgLatencyMs || 0} ms`}
          hint="从发出到获得响应/生成完成"
          tone="neutral"
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-xs text-gray-400">
          <Loader2 className="mx-auto size-6 animate-spin text-cyan-400 mb-2" />
          正在计算财务与调用流水...
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* 左侧：供应商支出明细 */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="p-5 border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Server className="size-4 text-cyan-400" />
                  各供应商成本与调用分布
                </h3>
                <span className="text-xs text-gray-400">按美金支出从高到低</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] bg-white/[0.02] text-gray-400">
                    <tr>
                      <th className="px-3 py-2.5">供应商</th>
                      <th className="px-3 py-2.5">调用次数</th>
                      <th className="px-3 py-2.5">成功率</th>
                      <th className="px-3 py-2.5">平均延迟</th>
                      <th className="px-3 py-2.5 text-right">真实成本 ($ USD)</th>
                      <th className="px-3 py-2.5 text-right">成本 (¥ CNY)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {(data?.providers || []).map((p) => (
                      <tr key={p.providerId} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5">
                          <span className="font-semibold text-white">{p.providerName}</span>
                          <span className="ml-1.5 font-mono text-[11px] text-gray-400">({p.providerId})</span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-gray-300">{p.totalCalls}</td>
                        <td className="px-3 py-2.5">
                          <span className={`font-mono ${p.successRate >= 95 ? 'text-emerald-400' : 'text-amber-400'}`}>
                            {p.successRate}%
                          </span>
                        </td>
                        <td className="px-3 py-2.5 font-mono text-gray-400">{p.avgLatencyMs} ms</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-red-400">
                          ${p.totalCostUsd.toFixed(4)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono text-gray-400">
                          ¥{p.totalCostCny.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {(data?.providers || []).length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-6 text-center text-gray-500">
                          当前筛选条件下暂无调用成本记录
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* 模型成本明细 */}
            <Card className="p-5 border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="text-sm font-bold text-white">模型物理成本分布</h3>
                <span className="text-xs text-gray-400">归属到规范模型的物理开销</span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-white/[0.08] bg-white/[0.02] text-gray-400">
                    <tr>
                      <th className="px-3 py-2.5">规范模型</th>
                      <th className="px-3 py-2.5">物理调用数</th>
                      <th className="px-3 py-2.5">成功率</th>
                      <th className="px-3 py-2.5 text-right">产生真实成本 ($ USD)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/[0.06]">
                    {(data?.models || []).map((m) => (
                      <tr key={m.modelId} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-2.5 font-semibold text-white">{m.modelName}</td>
                        <td className="px-3 py-2.5 font-mono text-gray-300">{m.totalCalls}</td>
                        <td className="px-3 py-2.5 font-mono text-emerald-400">{m.successRate}%</td>
                        <td className="px-3 py-2.5 text-right font-mono font-bold text-cyan-400">
                          ${m.totalCostUsd.toFixed(4)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          {/* 右侧：每日趋势 & 错误排查 */}
          <div className="space-y-6">
            {/* 每日消费流水 */}
            <Card className="p-5 border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Calendar className="size-4 text-cyan-400" />
                  每日支出流水
                </h3>
                <span className="text-[11px] text-gray-400 font-mono">USD</span>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {(data?.dailyTrends || []).map((d) => (
                  <div
                    key={d.date}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs"
                  >
                    <div>
                      <p className="font-mono text-gray-300">{d.date}</p>
                      <p className="text-[11px] text-gray-500">
                        {d.totalCalls} 次请求 ({d.successCalls} 成功)
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-red-400">${d.costUsd.toFixed(4)}</p>
                      <p className="text-[10px] text-gray-500">¥{d.costCny.toFixed(2)}</p>
                    </div>
                  </div>
                ))}
                {(data?.dailyTrends || []).length === 0 && (
                  <p className="py-6 text-center text-xs text-gray-500">暂无趋势记录</p>
                )}
              </div>
            </Card>

            {/* 错误归因 */}
            <Card className="p-5 border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <AlertTriangle className="size-4 text-amber-400" />
                  常见失败归因
                </h3>
                <span className="text-[11px] text-gray-400">Top 10</span>
              </div>

              <div className="space-y-2">
                {(data?.topErrors || []).map((err) => (
                  <div
                    key={err.errorCode}
                    className="flex items-center justify-between rounded-lg border border-white/[0.06] bg-white/[0.02] p-2.5 text-xs"
                  >
                    <span className="font-mono text-gray-300 truncate max-w-[180px]">{err.errorCode}</span>
                    <span className="font-mono font-bold text-amber-400">{err.count} 次</span>
                  </div>
                ))}
                {(data?.topErrors || []).length === 0 && (
                  <p className="py-6 text-center text-xs text-gray-500">无失败异常记录</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
