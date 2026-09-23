'use client';

import { useState } from 'react';
import { Card, MetricCard, StatusBadge, Button } from '@/components/admin/AdminUi';
import { TrendingUp, AlertTriangle, Coins, DollarSign, Calendar, Filter, Loader2, ArrowUpRight } from 'lucide-react';

export default function ProfitCenterClient({ initialData, models = [] }) {
  const [data, setData] = useState(initialData);
  const [selectedModel, setSelectedModel] = useState('');
  const [dateRange, setDateRange] = useState('30d');
  const [isLoading, setIsLoading] = useState(false);

  const fetchFilteredData = async (modelId, range) => {
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
      if (modelId) params.set('modelId', modelId);

      const res = await fetch(`/api/admin/analytics/profit?${params.toString()}`);
      const json = await res.json();
      if (res.ok && json.data) {
        setData(json.data);
      }
    } catch (err) {
      console.error('获取利润数据失败:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModelChange = (e) => {
    const val = e.target.value;
    setSelectedModel(val);
    fetchFilteredData(val, dateRange);
  };

  const handleDateRangeChange = (val) => {
    setDateRange(val);
    fetchFilteredData(selectedModel, val);
  };

  const summary = data?.summary || {};

  return (
    <div className="space-y-6">
      {/* 筛选控制器 */}
      <Card className="p-4 border-line-subtle bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-body-xs text-ink-muted">
              <Filter className="size-3.5 text-brand" />
              <span>模型筛选:</span>
            </div>
            <select
              value={selectedModel}
              onChange={handleModelChange}
              className="h-control-sm rounded-md border border-line-subtle bg-well px-2.5 text-body-xs text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
            >
              <option value="">全部规范模型 (All Models)</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.display_name || m.name} ({m.id})
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-1 bg-well p-0.5 rounded-lg border border-line-subtle">
            {[
              { id: '7d', label: '近 7 天' },
              { id: '14d', label: '近 14 天' },
              { id: '30d', label: '近 30 天' },
              { id: 'all', label: '全部历史' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => handleDateRangeChange(r.id)}
                className={`h-control-xs rounded px-2.5 text-body-xs font-medium transition-colors ${
                  dateRange === r.id
                    ? 'bg-raised text-label shadow-elevation-1'
                    : 'text-ink-muted hover:text-ink'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* KPI 指标概览 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <MetricCard
          label="用户 Credits 消耗折算营收"
          value={`$${summary.revenueUsd?.toFixed(2) || '0.00'}`}
          hint={`消耗: ${summary.totalCreditsConsumed || 0} 点 (约 ¥${summary.revenueCny?.toFixed(2) || '0.00'})`}
          tone="info"
        />
        <MetricCard
          label="物理供应商真实总成本"
          value={`$${summary.costUsd?.toFixed(2) || '0.00'}`}
          hint={`折合人民币: ¥${summary.costCny?.toFixed(2) || '0.00'}`}
          tone="neutral"
        />
        <MetricCard
          label="平台业务综合毛利润"
          value={`$${summary.grossProfitUsd?.toFixed(2) || '0.00'}`}
          hint={`折合人民币: ¥${summary.grossProfitCny?.toFixed(2) || '0.00'}`}
          tone={summary.grossProfitUsd >= 0 ? 'good' : 'danger'}
        />
        <MetricCard
          label="综合毛利率 (Gross Margin)"
          value={`${summary.grossMarginRate?.toFixed(1) || '0.0'}%`}
          hint={summary.marginAlertCount > 0 ? `⚠️ ${summary.marginAlertCount} 个模型毛利低于红线` : '全部模型毛利率健康'}
          tone={summary.marginAlertCount > 0 ? 'danger' : 'good'}
        />
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-xs text-ink-muted">
          <Loader2 className="mx-auto size-6 animate-spin text-brand mb-2" />
          正在核算模型营收与毛利...
        </div>
      ) : (
        <div className="space-y-6">
          {/* 模型利润分析表 */}
          <Card className="p-5 border-line-subtle space-y-4">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <div>
                <h3 className="text-body-sm font-bold text-ink flex items-center gap-2">
                  <TrendingUp className="size-4 text-good" />
                  模型利润率与盈亏监控
                </h3>
                <p className="mt-1 text-body-xs text-ink-muted">
                  对比各规范模型的 Credits 消耗折算营收、物理 API 成本以及毛利率。毛利率低于设定红线（默认 30%）将触发高亮预警。
                </p>
              </div>
              <span className="text-body-xs text-ink-muted">
                预警模型: <strong className="text-danger font-mono">{summary.marginAlertCount || 0}</strong> 个
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-xs">
                <thead className="border-b border-line-subtle bg-well text-ink-muted uppercase tracking-wider">
                  <tr>
                    <th className="px-4 py-3">规范模型</th>
                    <th className="px-4 py-3">业务类型</th>
                    <th className="px-4 py-3">成功生成数</th>
                    <th className="px-4 py-3">消耗 Credits</th>
                    <th className="px-4 py-3 text-right">折算营收 ($)</th>
                    <th className="px-4 py-3 text-right">真实成本 ($)</th>
                    <th className="px-4 py-3 text-right">毛利润 ($)</th>
                    <th className="px-4 py-3 text-right">实际毛利率</th>
                    <th className="px-4 py-3 text-center">状态预警</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {(data?.models || []).map((m) => {
                    const isLoss = m.grossProfitUsd < 0;
                    const isAlert = m.isMarginAlert;

                    return (
                      <tr
                        key={m.modelId}
                        className={`transition-colors duration-fast ${
                          isLoss
                            ? 'bg-danger-soft hover:bg-danger-hover'
                            : isAlert
                            ? 'bg-warning-soft hover:bg-wash'
                            : 'hover:bg-wash'
                        }`}
                      >
                        <td className="px-4 py-3">
                          <span className="font-semibold text-ink">{m.modelName}</span>
                          <span className="ml-1.5 font-mono text-[11px] text-ink-muted">({m.modelId})</span>
                        </td>
                        <td className="px-4 py-3 capitalize text-ink-muted">{m.category}</td>
                        <td className="px-4 py-3 font-mono text-ink">{m.totalGenerations}</td>
                        <td className="px-4 py-3 font-mono text-brand font-medium">
                          {m.creditsConsumed.toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ink">
                          ${m.revenueUsd.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-ink-muted">
                          ${m.costUsd.toFixed(4)}
                        </td>
                        <td
                          className={`px-4 py-3 text-right font-mono font-bold ${
                            isLoss ? 'text-danger' : 'text-good'
                          }`}
                        >
                          ${m.grossProfitUsd.toFixed(2)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-bold">
                          <span className={isAlert ? 'text-danger' : 'text-good'}>
                            {m.grossMarginRate.toFixed(1)}%
                          </span>
                          <span className="ml-1 text-micro text-ink-subtle font-normal">
                            (底线 {m.minGrossMarginRate}%)
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isLoss ? (
                            <span className="inline-flex items-center rounded-full bg-danger-soft border border-danger-line px-2.5 py-0.5 text-micro font-medium text-danger">
                              <AlertTriangle className="mr-1 size-3" /> 严重亏损
                            </span>
                          ) : isAlert ? (
                            <span className="inline-flex items-center rounded-full bg-warn-soft border border-warn-line px-2.5 py-0.5 text-micro font-medium text-warn">
                              毛利过低
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-good-soft border border-good-line px-2.5 py-0.5 text-micro font-medium text-good">
                              健康
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {(data?.models || []).length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-ink-subtle">
                        当前筛选范围暂无已完成的生成记录
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          {/* 每日利润流水趋势 */}
          <Card className="p-5 border-line-subtle space-y-4">
            <div className="flex items-center justify-between border-b border-line-subtle pb-3">
              <h3 className="text-body-sm font-bold text-ink flex items-center gap-2">
                <Calendar className="size-4 text-brand" />
                每日营收与毛利润明细
              </h3>
              <span className="text-body-xs text-ink-muted font-mono">USD</span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-xs">
                <thead className="border-b border-line-subtle bg-well text-ink-muted">
                  <tr>
                    <th className="px-4 py-2.5">日期</th>
                    <th className="px-4 py-2.5">完成任务数</th>
                    <th className="px-4 py-2.5">积分消耗</th>
                    <th className="px-4 py-2.5 text-right">折算营收 ($)</th>
                    <th className="px-4 py-2.5 text-right">物理成本 ($)</th>
                    <th className="px-4 py-2.5 text-right">当日毛利 ($)</th>
                    <th className="px-4 py-2.5 text-right">当日毛利率</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-subtle">
                  {(data?.dailyTrends || []).map((d) => (
                    <tr key={d.date} className="hover:bg-wash transition-colors duration-fast">
                      <td className="px-4 py-2.5 font-mono text-ink">{d.date}</td>
                      <td className="px-4 py-2.5 font-mono text-ink">{d.totalGenerations}</td>
                      <td className="px-4 py-2.5 font-mono text-brand">{d.creditsConsumed.toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-ink">${d.revenueUsd.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right font-mono text-ink-muted">${d.costUsd.toFixed(4)}</td>
                      <td
                        className={`px-4 py-2.5 text-right font-mono font-bold ${
                          d.grossProfitUsd >= 0 ? 'text-good' : 'text-danger'
                        }`}
                      >
                        ${d.grossProfitUsd.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-ink">
                        {d.grossMarginRate.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                  {(data?.dailyTrends || []).length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-ink-subtle">
                        暂无每日利润趋势数据
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
