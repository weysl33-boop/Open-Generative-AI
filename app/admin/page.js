import Link from 'next/link';
import { getDashboardOverview, emptyDashboardSnapshot } from '@/lib/services/dashboard';
import { Card, MetricCard, PageHeader, StatusBadge } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function AdminDashboardPage() {
  await requireAdminPagePermission(PERMISSIONS.dashboardRead);
  const data = await getDashboardOverview().catch(() => emptyDashboardSnapshot({ failedSections: ['dashboard'] }));
  const { metrics, trends, risks, recentAudit } = data;

  const totalCreations = metrics.creations;
  const successRate =
    totalCreations > 0
      ? `${Math.round((metrics.succeededCreations / totalCreations) * 100)}%`
      : null;

  // 找近 7 天峰值用于计算柱子高度百分比
  const maxDayCount = Math.max(...(trends?.last7Days?.map((d) => d.count) || [1]), 1);

  return (
    <>
      <PageHeader
        eyebrow="商业化运营与智能监控"
        title="运营概览 & 经营毛利看板"
        description="实时监控 KoyoSIM AI Studio 平台注册增长、模型调用稳定性、商业化营收、上游 API 成本及综合毛利。"
      >
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center rounded-full border border-line bg-wash px-2.5 py-0.5 text-xs font-medium text-ink-muted">
            时区：{data.meta.reportTimezone}
          </span>
          <span className="inline-flex items-center rounded-full border border-success-line bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success">
            实时营收结算
          </span>
          {data.meta.degraded && (
            <span className="inline-flex items-center rounded-full border border-warning-line bg-warning-soft px-2.5 py-0.5 text-xs font-medium text-warning">
              部分指标暂不可用
            </span>
          )}
        </div>
      </PageHeader>

      {/* 6 大经营核心 KPI 指标卡 */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-6">
        <MetricCard
          label="总注册用户"
          value={metrics.users}
          hint={`今日新增 +${metrics.todayNewUsers || 0} 位`}
          tone="neutral"
        />
        <MetricCard
          label="当前活跃用户"
          value={metrics.activeSessions}
          hint={`${metrics.subscriptions} 位付费订阅中`}
          tone="info"
        />
        <MetricCard
          label="生成总调用量"
          value={metrics.creations}
          hint={successRate ? `成功率 ${successRate} (失败 ${metrics.failedCreations})` : '今日暂无生成记录'}
          tone={metrics.failedCreations > 0 ? 'warn' : 'info'}
        />
        <MetricCard
          label="平台总收入 (GMV)"
          value={`$${metrics.incomeUsd.toFixed(2)}`}
          hint={`CNY: ¥${metrics.incomeCny.toFixed(2)} (${metrics.paidOrdersCount || 0} 笔支付)`}
          tone="good"
        />
        <MetricCard
          label="上游 API 总成本"
          value={`$${metrics.totalApiCostUsd.toFixed(2)}`}
          hint="模型官方接口费用"
          tone={metrics.totalApiCostUsd > 0 ? 'warn' : 'neutral'}
        />
        <MetricCard
          label="综合毛利 (毛利率)"
          value={`$${metrics.grossProfitUsd.toFixed(2)}`}
          hint={`毛利率: ${metrics.grossMarginPct}%`}
          tone={metrics.grossProfitUsd >= 0 ? 'good' : 'danger'}
        />
      </div>

      {/* 近 7 天调用趋势与风险队列 */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.5fr_1fr]">
        {/* 调用走势柱状图 */}
        <Card>
          <div className="flex items-center justify-between border-b border-line-subtle pb-4">
            <div>
              <h2 className="text-card-title font-semibold text-ink">近 7 天生成调用走势</h2>
              <p className="mt-1 text-body-sm text-ink-muted">每日 AI 图像/视频生成请求总量</p>
            </div>
            <span className="text-caption font-mono text-ink-muted">
              7 天累计: {trends?.last7Days?.reduce((acc, d) => acc + d.count, 0) || 0} 次
            </span>
          </div>

          <div className="mt-6 flex h-48 items-end gap-3 sm:gap-6 px-2">
            {trends?.last7Days?.map((day) => {
              const heightPct = Math.max(8, Math.round((day.count / maxDayCount) * 100));
              return (
                <div key={day.date} className="group relative flex flex-1 flex-col items-center h-full justify-end">
                  {/* Tooltip */}
                  <div className="pointer-events-none absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity duration-fast rounded-md border border-line-subtle bg-overlay px-2 py-1 text-caption text-brand font-mono shadow-elevation-2 whitespace-nowrap">
                    {day.date}: {day.count} 次
                  </div>
                  {/* 柱子 */}
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full max-w-[42px] rounded-t-md bg-brand-soft border-t border-x border-brand-line transition-[background-color] duration-fast group-hover:bg-brand"
                  />
                  <span className="mt-2 text-caption text-ink-muted font-mono">{day.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 待处理风险队列 */}
        <Card>
          <div className="flex items-center justify-between border-b border-line-subtle pb-4">
            <div>
              <h2 className="text-card-title font-semibold text-ink">待处理风险队列</h2>
              <p className="mt-1 text-body-sm text-ink-muted">系统检测到的生成失败或待审核异常项</p>
            </div>
            <StatusBadge tone={risks.length ? 'warn' : 'good'}>
              {risks.length ? `${risks.length} 项关注` : '健康平稳'}
            </StatusBadge>
          </div>

          <div className="mt-5 space-y-3">
            {risks.length ? (
              risks.map((risk) => (
                <div
                  key={risk.id}
                  className="flex items-center justify-between rounded-lg border border-line-subtle bg-raised p-4 transition-[border-color,background-color] duration-fast hover:border-line hover:bg-overlay"
                >
                  <div>
                    <p className="text-body font-medium text-ink">{risk.title}</p>
                    <p className="mt-1 text-body-sm text-ink-muted">
                      共有 <span className="font-semibold text-warning">{risk.count}</span> 条记录待处理
                    </p>
                  </div>
                  <Link
                    href={risk.link}
                    className="h-control-sm inline-flex items-center rounded-md border border-line-subtle bg-surface px-3 text-label font-medium text-ink transition-[border-color,background-color,color] duration-fast hover:border-line hover:bg-overlay hover:text-brand"
                  >
                    立即排查 →
                  </Link>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-dashed border-line-subtle p-8 text-center">
                <p className="text-body-sm text-ink-muted">当前暂无待处理风险，系统运行正常。</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 最近管理员动作与快捷面板 */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-line-subtle pb-4">
            <div>
              <h2 className="text-card-title font-semibold text-ink">最近管理员操作审计</h2>
              <p className="mt-1 text-body-sm text-ink-muted">全站重要管理动作（调额、改价、封禁、切换角色）全自动留痕</p>
            </div>
            <Link href="/admin/audit" className="text-caption text-brand hover:underline font-medium">
              全部审计记录 →
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {recentAudit.length ? (
              recentAudit.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 border-b border-line-subtle pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-body-sm font-medium text-ink">{item.action}</p>
                    <p className="mt-1 truncate text-caption text-ink-subtle font-mono">
                      {item.actor_email} · {item.target_type || '系统'} {item.target_id || ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <StatusBadge
                      tone={
                        item.risk_level === 'high'
                          ? 'danger'
                          : item.risk_level === 'medium'
                          ? 'warn'
                          : 'neutral'
                      }
                    >
                      {item.risk_level}
                    </StatusBadge>
                    <p className="mt-1 text-micro text-ink-subtle">{formatDate(item.created_at)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-body-sm text-ink-subtle">暂无管理员操作记录</div>
            )}
          </div>
        </Card>

        {/* 快捷导航与模型管理入口 */}
        <Card>
          <h2 className="text-card-title font-semibold text-ink mb-1.5">快速调度与运维入口</h2>
          <p className="text-body-sm text-ink-muted mb-4">一键直达核心业务管控模块</p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/admin/users"
              className="rounded-lg border border-line-subtle bg-raised p-3.5 hover:border-line hover:bg-overlay transition-[border-color,background-color] duration-fast"
            >
              <p className="text-body-sm font-medium text-ink">👥 用户与角色</p>
              <p className="mt-1 text-caption text-ink-muted">搜索、封禁、解封</p>
            </Link>
            <Link
              href="/admin/credits"
              className="rounded-lg border border-line-subtle bg-raised p-3.5 hover:border-line hover:bg-overlay transition-[border-color,background-color] duration-fast"
            >
              <p className="text-body-sm font-medium text-ink">💰 额度流水台账</p>
              <p className="mt-1 text-caption text-ink-muted">充值、扣减、明细</p>
            </Link>
            <Link
              href="/admin/models"
              className="rounded-lg border border-brand-line bg-brand-soft p-3.5 hover:border-brand hover:bg-brand-pressed transition-[border-color,background-color] duration-fast"
            >
              <p className="text-body-sm font-medium text-brand">🎛️ 模型开关与成本</p>
              <p className="mt-1 text-caption text-brand">成本价与 Credits 定价</p>
            </Link>
            <Link
              href="/admin/health"
              className="rounded-lg border border-line-subtle bg-raised p-3.5 hover:border-line hover:bg-overlay transition-[border-color,background-color] duration-fast"
            >
              <p className="text-body-sm font-medium text-ink">🩺 系统健康 & 日志</p>
              <p className="mt-1 text-caption text-ink-muted">PM2 日志、队列与内存</p>
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
