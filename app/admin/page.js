import Link from 'next/link';
import { getDashboardOverview } from '@/lib/services/dashboard';
import { Card, MetricCard, PageHeader, StatusBadge } from '@/components/admin/AdminUi';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function AdminDashboardPage() {
  const data = await getDashboardOverview();
  const { metrics, trends, risks, recentAudit } = data;

  const totalCreations = metrics.creations;
  const successRate =
    totalCreations > 0
      ? `${Math.round(((totalCreations - metrics.failedCreations) / totalCreations) * 100)}%`
      : '100%';

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
          <span className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/50">
            时区：Asia/Shanghai
          </span>
          <span className="rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
            实时营收结算
          </span>
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
          hint={`成功率 ${successRate} (失败 ${metrics.failedCreations})`}
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
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
            <div>
              <h2 className="text-base font-bold text-white">近 7 天生成调用走势</h2>
              <p className="mt-1 text-xs text-white/40">每日 AI 图像/视频生成请求总量</p>
            </div>
            <span className="text-xs text-white/40 font-mono">
              7 天累计: {trends?.last7Days?.reduce((acc, d) => acc + d.count, 0) || 0} 次
            </span>
          </div>

          <div className="mt-6 flex h-48 items-end gap-3 sm:gap-6 px-2">
            {trends?.last7Days?.map((day) => {
              const heightPct = Math.max(8, Math.round((day.count / maxDayCount) * 100));
              return (
                <div key={day.date} className="group relative flex flex-1 flex-col items-center h-full justify-end">
                  {/* Tooltip */}
                  <div className="absolute -top-9 opacity-0 group-hover:opacity-100 transition rounded bg-white/10 backdrop-blur px-2 py-1 text-[10px] text-cyan-200 font-mono pointer-events-none whitespace-nowrap">
                    {day.date}: {day.count} 次
                  </div>
                  {/* 柱子 */}
                  <div
                    style={{ height: `${heightPct}%` }}
                    className="w-full max-w-[42px] rounded-t-lg bg-gradient-to-t from-cyan-500/30 to-cyan-300 transition-all group-hover:from-cyan-400/50 group-hover:to-cyan-200 shadow-lg shadow-cyan-300/10"
                  />
                  <span className="mt-2 text-[11px] text-white/50 font-mono">{day.label}</span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* 待处理风险队列 */}
        <Card>
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
            <div>
              <h2 className="text-base font-bold text-white">待处理风险队列</h2>
              <p className="mt-1 text-xs text-white/40">系统检测到的生成失败或待审核异常项</p>
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
                  className="flex items-center justify-between rounded-xl border border-white/[0.08] bg-black/30 p-4 transition hover:border-white/20"
                >
                  <div>
                    <p className="text-sm font-semibold text-white">{risk.title}</p>
                    <p className="mt-1 text-xs text-white/40">
                      共有 <span className="font-bold text-amber-300">{risk.count}</span> 条记录待处理
                    </p>
                  </div>
                  <Link
                    href={risk.link}
                    className="rounded-xl border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white/80 hover:bg-white/10"
                  >
                    立即排查 →
                  </Link>
                </div>
              ))
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
                <p className="text-xs text-white/40">当前暂无待处理风险，系统运行正常。</p>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* 最近管理员动作与快捷面板 */}
      <div className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4">
            <div>
              <h2 className="text-base font-bold text-white">最近管理员操作审计</h2>
              <p className="mt-1 text-xs text-white/40">全站重要管理动作（调额、改价、封禁、切换角色）全自动留痕</p>
            </div>
            <Link href="/admin/audit" className="text-xs text-cyan-200 hover:text-cyan-100 font-semibold">
              全部审计记录 →
            </Link>
          </div>

          <div className="mt-4 space-y-3">
            {recentAudit.length ? (
              recentAudit.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start justify-between gap-3 border-b border-white/[0.05] pb-3 last:border-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-white/80">{item.action}</p>
                    <p className="mt-1 truncate text-[11px] text-white/35">
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
                    <p className="mt-1 text-[10px] text-white/30">{formatDate(item.created_at)}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="p-8 text-center text-xs text-white/40">暂无管理员操作记录</div>
            )}
          </div>
        </Card>

        {/* 快捷导航与模型管理入口 */}
        <Card>
          <h2 className="text-base font-bold text-white mb-2">快速调度与运维入口</h2>
          <p className="text-xs text-white/45 mb-5">一键直达核心业务管控模块</p>
          <div className="grid grid-cols-2 gap-3">
            <Link
              href="/admin/users"
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 hover:border-cyan-300/40 hover:bg-white/[0.06] transition"
            >
              <p className="text-xs font-bold text-white">👥 用户与角色</p>
              <p className="mt-1 text-[11px] text-white/40">搜索、封禁、解封</p>
            </Link>
            <Link
              href="/admin/credits"
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 hover:border-cyan-300/40 hover:bg-white/[0.06] transition"
            >
              <p className="text-xs font-bold text-white">💰 额度流水台账</p>
              <p className="mt-1 text-[11px] text-white/40">充值、扣减、明细</p>
            </Link>
            <Link
              href="/admin/models"
              className="rounded-xl border border-cyan-400/30 bg-cyan-400/10 p-3.5 hover:bg-cyan-400/15 transition"
            >
              <p className="text-xs font-bold text-cyan-200">🎛️ 模型开关与成本</p>
              <p className="mt-1 text-[11px] text-cyan-200/70">成本价与 Credits 定价</p>
            </Link>
            <Link
              href="/admin/health"
              className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5 hover:border-cyan-300/40 hover:bg-white/[0.06] transition"
            >
              <p className="text-xs font-bold text-white">🩺 系统健康 & 日志</p>
              <p className="mt-1 text-[11px] text-white/40">PM2 日志、队列与内存</p>
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
