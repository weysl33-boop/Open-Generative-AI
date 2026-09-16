import { queryAuditLogs } from '@/lib/admin/audit';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function AuditPage({ searchParams }) {
  const params = toSearchParams(await searchParams);
  const result = await queryAuditLogs(params);

  const columns = [
    {
      key: 'action',
      label: '管理动作',
      render: (row) => (
        <div>
          <span className="font-semibold text-white font-mono text-xs">{row.action}</span>
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
          <p className="text-white/90 text-xs">{row.actor_email}</p>
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
          <span className="text-white/40 text-[11px] uppercase tracking-wider">{row.target_type || '系统'}</span>
          {row.target_id && (
            <div className="mt-0.5 font-mono text-xs text-white/70">
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
            <pre className="truncate rounded-md bg-black/40 p-1.5 text-white/60" title={JSON.stringify(row.after, null, 2)}>
              {JSON.stringify(row.after)}
            </pre>
          ) : (
            <span className="text-white/30">—</span>
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
            className="min-w-[260px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50"
          />

          <select
            name="risk"
            defaultValue={params.get('risk') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3.5 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
          >
            <option value="">全部风险级别</option>
            <option value="high">High (高危操作)</option>
            <option value="medium">Medium (中等变动)</option>
            <option value="low">Low (日常动作)</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-200"
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
