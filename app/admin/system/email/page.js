import Link from 'next/link';
import {
  Card,
  CopyableId,
  DataTable,
  MetricCard,
  PageHeader,
  Pagination,
  StatusBadge,
} from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import { toSearchParams } from '@/lib/admin/pagination';
import { getEmailSendStats, getEmailSmtpOverview, listEmailSendLogs } from '@/lib/emailAdmin';
import EmailSettingsClient from './EmailSettingsClient';

export const dynamic = 'force-dynamic';

export const metadata = { title: '邮件发信设置与统计 | 管理后台' };

const PURPOSE_LABELS = {
  verification: '验证码',
  test: '后台测试',
  system: '系统通知',
  marketing: '营销邮件',
};

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

function selectClass() {
  return 'rounded-xl border border-line bg-canvas px-3 py-2.5 text-label text-ink-muted outline-none focus:border-brand-ring';
}

const columns = [
  {
    key: 'recipient',
    label: '收件人',
    render: (row) => (
      <div>
        <p className="font-semibold text-ink">{row.recipient}</p>
        <p className="mt-0.5 text-caption text-ink-subtle">{row.recipient_domain || '—'}</p>
      </div>
    ),
  },
  {
    key: 'purpose',
    label: '发信类型',
    render: (row) => (
      <StatusBadge tone={row.purpose === 'marketing' ? 'info' : row.purpose === 'test' ? 'warn' : 'neutral'}>
        {PURPOSE_LABELS[row.purpose] || row.purpose}
      </StatusBadge>
    ),
  },
  {
    key: 'content',
    label: '发信内容',
    render: (row) => (
      <div className="max-w-90">
        <p className="truncate font-medium text-ink" title={row.subject}>{row.subject}</p>
        <p className="mt-0.5 whitespace-pre-line text-caption leading-4 text-ink-subtle">{row.body_preview || '—'}</p>
      </div>
    ),
  },
  {
    key: 'status',
    label: '投递结果',
    render: (row) => (
      <div>
        <StatusBadge tone={row.status === 'success' ? 'good' : 'danger'}>
          {row.status === 'success' ? '已接受' : '失败'}
        </StatusBadge>
        {row.error_code && <p className="mt-1 text-caption text-danger">{row.error_code}</p>}
      </div>
    ),
  },
  {
    key: 'latency',
    label: '耗时',
    render: (row) => (
      <span className="font-mono text-ink-muted">{row.latency_ms != null ? `${row.latency_ms} ms` : '—'}</span>
    ),
  },
  {
    key: 'created_at',
    label: '发信时间',
    render: (row) => <span className="text-label text-ink-muted">{formatDate(row.created_at)}</span>,
  },
  {
    key: 'trace',
    label: '记录',
    render: (row) => <CopyableId id={row.id} />,
  },
];

export default async function EmailSettingsPage({ searchParams }) {
  const user = await requireAdminPagePermission(PERMISSIONS.providersRead);
  const params = toSearchParams(await searchParams);
  const [overview, stats, logs] = await Promise.all([
    getEmailSmtpOverview(),
    getEmailSendStats(),
    listEmailSendLogs({ searchParams: params }),
  ]);

  const summary = stats.summary;
  const successRate = summary.all_total ? Math.round((summary.all_success / summary.all_total) * 100) : null;
  const peak = Math.max(1, ...stats.trend.map((item) => item.total));
  const domains = stats.topDomains;
  const domainPeak = Math.max(1, ...domains.map((item) => item.total));

  return (
    <>
      <PageHeader
        eyebrow="系统与安全"
        title="邮件发信设置与统计"
        description="SMTP 凭据、连接检查、测试发信集中在本页配置；下方是全部发信的统计与内容明细。"
      />

      <div className="flex flex-col gap-6">
        <EmailSettingsClient
          initial={overview}
          canWrite={hasPermission(user.role, PERMISSIONS.providersWrite)}
        />

        <section>
          <h2 className="text-card-title text-ink">发信统计</h2>
          <p className="mt-1 mb-4 text-body-sm text-ink-muted">按投递事实聚合，验证码明文不入明细表。</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <MetricCard label="今日发信" value={summary.today_total ?? 0} hint={`成功 ${summary.today_success ?? 0} 封`} tone="info" />
            <MetricCard label="近 7 天发信" value={summary.week_total ?? 0} hint={`失败 ${summary.week_failed ?? 0} 封 · 平均 ${summary.week_avg_latency_ms ?? '—'} ms`} tone={summary.week_failed ? 'warn' : 'neutral'} />
            <MetricCard label="累计送达率" value={successRate == null ? '—' : `${successRate}%`} hint={`累计 ${summary.all_total ?? 0} 封 · 失败 ${summary.all_failed ?? 0} 封`} tone={successRate != null && successRate < 90 ? 'danger' : 'good'} />
            <MetricCard label="当前通道" value={overview.configured ? 'QQ 企业邮箱' : '未配置'} hint={`smtp.exmail.qq.com : 465 · SSL/TLS`} tone={overview.configured ? 'good' : 'warn'} />
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <Card>
              <h3 className="text-label font-semibold text-ink">近 7 天发信量</h3>
              {stats.trend.length ? (
                <div className="mt-4 flex h-32 items-end gap-2">
                  {stats.trend.map((item) => (
                    <div key={item.day} className="flex flex-1 flex-col items-center gap-1.5">
                      <span className="text-caption tabular-nums text-ink-muted">{item.total}</span>
                      <div className="flex w-full flex-col justify-end gap-0.5" style={{ height: '88px' }}>
                        <div className="w-full rounded-t bg-brand" style={{ height: `${(item.total / peak) * 100}%` }} />
                        {item.failed > 0 && <div className="w-full rounded-b bg-danger" style={{ height: `${(item.failed / peak) * 100}%` }} />}
                      </div>
                      <span className="text-micro text-ink-subtle">{item.day}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-4 text-body-sm text-ink-subtle">近 7 天还没有发信记录。</p>
              )}
            </Card>

            <Card>
              <h3 className="text-label font-semibold text-ink">按类型与域名分布（近 7 天 / 30 天）</h3>
              <div className="mt-4 flex flex-col gap-2">
                {stats.byPurpose.length ? stats.byPurpose.map((item) => (
                  <div key={item.purpose} className="flex items-center justify-between text-body-sm">
                    <span className="text-ink">{PURPOSE_LABELS[item.purpose] || item.purpose}</span>
                    <span className="tabular-nums text-ink-muted">
                      {item.total} 封
                      {item.failed > 0 && <span className="ml-2 text-danger">失败 {item.failed}</span>}
                    </span>
                  </div>
                )) : <p className="text-body-sm text-ink-subtle">近 7 天没有按类型聚合的记录。</p>}
              </div>
              <div className="mt-5 flex flex-col gap-2 border-t border-line pt-4">
                {domains.map((item) => (
                  <div key={item.domain} className="flex items-center gap-3">
                    <span className="w-32 shrink-0 truncate text-caption text-ink-muted" title={item.domain}>{item.domain}</span>
                    <div className="h-1.5 flex-1 rounded-full bg-wash-press">
                      <div className="h-1.5 rounded-full bg-brand" style={{ width: `${(item.total / domainPeak) * 100}%` }} />
                    </div>
                    <span className="w-10 shrink-0 text-right text-caption tabular-nums text-ink">{item.total}</span>
                  </div>
                ))}
                {!domains.length && <p className="text-caption text-ink-subtle">暂无收件域名分布数据。</p>}
              </div>
            </Card>
          </div>
        </section>

        <section>
          <h2 className="text-card-title text-ink">发信内容明细</h2>
          <p className="mt-1 mb-4 text-body-sm text-ink-muted">逐封记录收件人、主题、正文摘要与投递结果，可按类型、状态与时间筛选。</p>

          <Card className="mb-4">
            <form className="flex flex-wrap items-center gap-3">
              <input
                name="q"
                defaultValue={params.get('q') || ''}
                placeholder="搜索收件邮箱或主题…"
                className="min-w-60 flex-1 rounded-xl border border-line bg-scrim px-4 py-2.5 text-label text-ink outline-none focus:border-brand-ring"
              />
              <select name="purpose" defaultValue={params.get('purpose') || ''} className={selectClass()}>
                <option value="">全部发信类型</option>
                <option value="verification">验证码</option>
                <option value="test">后台测试</option>
                <option value="system">系统通知</option>
                <option value="marketing">营销邮件</option>
              </select>
              <select name="status" defaultValue={params.get('status') || ''} className={selectClass()}>
                <option value="">全部投递结果</option>
                <option value="success">已接受</option>
                <option value="failed">失败</option>
              </select>
              <select name="days" defaultValue={params.get('days') || ''} className={selectClass()}>
                <option value="">全部时间</option>
                <option value="1">近 24 小时</option>
                <option value="7">近 7 天</option>
                <option value="30">近 30 天</option>
              </select>
              <button type="submit" className="rounded-xl bg-brand px-5 py-2.5 text-label font-bold text-ink-on-accent transition hover:bg-brand-active">
                筛选
              </button>
              {Array.from(params.keys()).length > 0 && (
                <Link href="/admin/system/email" className="rounded-xl border border-line px-3 py-2.5 text-label text-ink-subtle hover:bg-wash hover:text-ink">
                  重置
                </Link>
              )}
            </form>
          </Card>

          <DataTable columns={columns} rows={logs.rows} empty="还没有发信记录，可先用上方「发送真实测试邮件」验证链路" />
          <Pagination meta={logs.meta} searchParams={params} />
        </section>

        <Card>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-card-title text-ink">
                邮件营销系统
                <StatusBadge tone="neutral">待定计划</StatusBadge>
              </h2>
              <p className="mt-1 max-w-2xl text-body-sm text-ink-muted">
                后续在此页扩展群发能力：受众分群（复用用户运营的运营标签）、模板与主题排期、按域名限速与退订链接、投递回执回流到上方明细表。
                当前 <code className="rounded bg-wash px-1.5 py-0.5 text-caption text-ink">marketing</code> 类型已在明细表结构中预留，接入群发任务后无需再次改表。
              </p>
            </div>
            <Link href="/admin/users" className="h-9 shrink-0 rounded-lg border border-line bg-wash px-4 inline-flex items-center text-label text-ink hover:bg-wash-press">
              查看用户分群
            </Link>
          </div>
        </Card>
      </div>
    </>
  );
}
