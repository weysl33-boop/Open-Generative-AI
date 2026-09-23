'use client';

import { useState, useCallback } from 'react';
import { Card, StatusBadge, Button as AdminUiButton } from '@/components/admin/AdminUi';
import StandardButton from '@/components/ui/button';

// 防御性组件：确保无论导入形态如何，Button 100% 存在且有效
const Button = AdminUiButton || StandardButton || (({ children, className = '', ...props }) => (
  <button className={`inline-flex items-center justify-center rounded-lg px-4 py-2 font-medium transition ${className}`} {...props}>
    {children}
  </button>
));
import {
  MousePointerClick,
  Eye,
  Percent,
  XCircle,
  Users,
  RefreshCw,
  Trash2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';

export default function BannerAnalyticsClient({ initialData }) {
  const [data, setData] = useState(initialData || { kpi: {}, events: [], pagination: {} });
  const [isLoading, setIsLoading] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const fetchData = useCallback(async (currentOffset = 0) => {
    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/content/analytics?limit=${limit}&offset=${currentOffset}`);
      if (!res.ok) throw new Error('拉取分析数据失败');
      const json = await res.json();
      setData(json.data || {});
      setOffset(currentOffset);
    } catch (err) {
      alert(err.message);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);

  const handleReset = async () => {
    if (!confirm('确定要清空当前的横幅统计数据与点击流水吗？此操作不可逆，将留存高风险审计日志。')) {
      return;
    }

    setIsResetting(true);
    try {
      const res = await fetch('/api/admin/content/analytics', {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('重置失败');
      await fetchData(0);
      alert('横幅统计数据已成功清空');
    } catch (err) {
      alert(err.message);
    } finally {
      setIsResetting(false);
    }
  };

  const { kpi = {}, events = [], pagination = {} } = data;
  const total = pagination.total || 0;
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;

  return (
    <div className="space-y-6">
      {/* 顶部统计卡片 (KPIs) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-brand-soft text-brand">
            <Eye className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-ink-subtle">累计曝光展示</div>
            <div className="text-xl font-extrabold text-ink mt-0.5">
              {kpi.impressions?.toLocaleString() ?? 0}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-success-soft text-success">
            <MousePointerClick className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-ink-subtle">真实点击次数</div>
            <div className="text-xl font-extrabold text-ink mt-0.5">
              {kpi.clicks?.toLocaleString() ?? 0}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Percent className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-ink-subtle">点击转化率 (CTR)</div>
            <div className="text-xl font-extrabold text-brand-hover mt-0.5">
              {kpi.ctr ?? 0}%
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-warning-soft text-warning">
            <XCircle className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-ink-subtle">用户主动关闭</div>
            <div className="text-xl font-extrabold text-ink mt-0.5">
              {kpi.dismissals?.toLocaleString() ?? 0}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-400">
            <Users className="size-5" />
          </div>
          <div>
            <div className="text-[11px] font-semibold text-ink-subtle">独立访客 (UV)</div>
            <div className="text-xl font-extrabold text-ink mt-0.5">
              {kpi.uniqueVisitors?.toLocaleString() ?? 0}
            </div>
          </div>
        </Card>
      </div>

      {/* 点击与事件流水明细卡片 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
          <div>
            <h2 className="text-sm font-bold text-ink">用户点击与交互流水明细</h2>
            <p className="text-[11px] text-ink-subtle mt-0.5">
              记录每一次真实发生的用户点击、曝光或关闭操作（共 {total} 条记录）
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchData(offset)}
              disabled={isLoading}
              className="inline-flex h-control-sm items-center gap-1.5 rounded-md border border-line-subtle bg-surface px-3 text-body-xs font-medium text-ink hover:bg-wash transition disabled:opacity-50"
            >
              <RefreshCw className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>刷新</span>
            </button>

            <button
              type="button"
              onClick={handleReset}
              disabled={isResetting || total === 0}
              className="inline-flex h-control-sm items-center gap-1.5 rounded-md border border-danger-line bg-danger-soft px-3 text-body-xs font-medium text-danger hover:bg-danger-hover transition-colors duration-fast disabled:opacity-50"
            >
              <Trash2 className="size-3.5" />
              <span>清空测试数据</span>
            </button>
          </div>
        </div>

        {/* 流水表格 */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-line-subtle text-ink-subtle">
                <th className="pb-3 font-semibold">事件类型</th>
                <th className="pb-3 font-semibold">发生时间</th>
                <th className="pb-3 font-semibold">触发页面</th>
                <th className="pb-3 font-semibold">目标链接</th>
                <th className="pb-3 font-semibold">语言环境</th>
                <th className="pb-3 font-semibold">用户属性</th>
                <th className="pb-3 font-semibold">访客 IP (脱敏)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line-subtle text-ink">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-ink-subtle">
                    暂无交互埋点记录（可在前台点击顶部横幅测试产生流水）
                  </td>
                </tr>
              ) : (
                events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-wash transition-colors">
                    <td className="py-3">
                      {evt.eventType === 'click' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-micro font-bold bg-success-soft text-success border border-success-line">
                          点击 CLICK
                        </span>
                      ) : evt.eventType === 'dismiss' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-micro font-bold bg-warning-soft text-warning border border-warning-line">
                          关闭 DISMISS
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-micro font-bold bg-brand-soft text-brand-hover border border-brand-soft">
                          曝光 VIEW
                        </span>
                      )}
                    </td>
                    <td className="py-3 text-ink-muted font-mono text-[11px]">
                      {new Date(evt.createdAt).toLocaleString('zh-CN', {
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-brand-hover">
                      {evt.pagePath}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-ink-subtle max-w-[200px] truncate" title={evt.targetUrl}>
                      {evt.targetUrl ? (
                        <span className="flex items-center gap-1">
                          <span className="truncate">{evt.targetUrl}</span>
                          <ExternalLink className="size-3 flex-shrink-0 opacity-40" />
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-3">
                      <span className="px-1.5 py-0.5 rounded bg-wash text-micro font-mono text-ink-muted">
                        {evt.locale || 'zh-CN'}
                      </span>
                    </td>
                    <td className="py-3 text-[11px]">
                      {evt.userId ? (
                        <span className="text-brand font-mono font-bold" title={evt.userId}>
                          用户 #{evt.userId.slice(0, 8)}
                        </span>
                      ) : (
                        <span className="text-ink-subtle">匿名访客</span>
                      )}
                    </td>
                    <td className="py-3 font-mono text-[11px] text-ink-subtle">
                      {evt.ip}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* 分页导航 */}
        {total > limit && (
          <div className="flex items-center justify-between border-t border-line-subtle pt-3 text-xs text-ink-subtle">
            <span>
              显示第 {offset + 1} - {Math.min(offset + limit, total)} 条，共 {total} 条
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!hasPrev || isLoading}
                onClick={() => fetchData(offset - limit)}
                className="inline-flex h-control-xs items-center gap-1 rounded-md border border-line-subtle bg-surface px-2.5 text-micro font-medium text-ink hover:bg-wash disabled:opacity-30 transition"
              >
                <ChevronLeft className="size-3.5" />
                <span>上一页</span>
              </button>
              <button
                type="button"
                disabled={!hasNext || isLoading}
                onClick={() => fetchData(offset + limit)}
                className="inline-flex h-control-xs items-center gap-1 rounded-md border border-line-subtle bg-surface px-2.5 text-micro font-medium text-ink hover:bg-wash disabled:opacity-30 transition"
              >
                <span>下一页</span>
                <ChevronRight className="size-3.5" />
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
