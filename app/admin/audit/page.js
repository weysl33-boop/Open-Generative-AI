import { queryAuditLogs } from '@/lib/admin/audit';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function AuditPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.auditRead);
  const params = toSearchParams(await searchParams);
  const result = await queryAuditLogs(params);

  const columns = [
    {
      key: 'action',
      label: '管理动作',
      render: (row) => (
        <div>
          <span className="font-semibold text-ink font-mono text-xs">{row.action}</span>
          {row.request_id && (
            <div className="mt-0.5">
              <CopyableId id={row.request_id} label="ReqId" />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'actor',
      label: '操作管理员',
      render: (row) => (
        <div>
          <p className="text-ink text-xs">{row.actor_email}</p>
          <div className="mt-0.5">
            <CopyableId id={row.actor_id} />
          </div>
        </div>
      ),
    },
    {
      key: 'target',
      label: '变更目标',
      render: (row) => (
        <div>
          <span className="text-ink-subtle text-[11px] uppercase tracking-wider">{row.target_type || '系统'}</span>
          {row.target_id && (
            <div className="mt-0.5 font-mono text-xs text-ink-muted">
              <CopyableId id={row.target_id} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'risk_level',
      label: '风险等级',
      render: (row) => (
        <StatusBadge
          tone={
            row.risk_level === 'high'
              ? 'danger'
              : row.risk_level === 'medium'
              ? 'warn'
              : 'neutral'
          }
        >
          {row.risk_level}
        </StatusBadge>
      ),
    },
    {
      key: 'details',
      label: '变更快照 (已自动脱敏)',
      render: (row) => (
        <div className="max-w-[280px] font-mono text-[11px]">
          {row.after ? (
            <pre className="truncate rounded border border-line-subtle bg-well p-1.5 text-ink-muted" title={JSON.stringify(row.after, null, 2)}>
              {JSON.stringify(row.after)}
            </pre>
          ) : (
            <span className="text-ink-subtle">—</span>
          )}
        </div>
      ),
    },
    {
      key: 'created_at',
      label: '记录时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="系统审计"
        title="审计日志"
        description="追溯所有管理员在后台执行的额度调整、角色变更、订单退款、密钥轮换等敏感动作。敏感字段自动过滤脱敏。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索管理员邮箱、动作名称或目标 ID…"
            className="min-w-[260px] flex-1 h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink placeholder:text-ink-subtle focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
          />

          <select
            name="risk"
            defaultValue={params.get('risk') || ''}
            className="h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
          >
            <option value="">全部风险级别</option>
            <option value="high">High (高危操作)</option>
            <option value="medium">Medium (中等变动)</option>
            <option value="low">Low (日常动作)</option>
          </select>

          <button
            type="submit"
            className="h-control-md rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-sm font-semibold text-ink-on-accent transition-colors"
          >
            筛选日志
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="未找到匹配的审计日志记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
