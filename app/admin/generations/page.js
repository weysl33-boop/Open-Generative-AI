import Link from 'next/link';
import { listCreations } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { UserSubject } from '@/components/admin/UserSubject';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function GenerationsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.generationsRead);
  const params = toSearchParams(await searchParams);
  const result = await listCreations(params);

  const columns = [
    {
      key: 'id',
      label: '任务 ID / 用户',
      render: (row) => (
        <div>
          <CopyableId id={row.id} />
          <div className="mt-1">
            <UserSubject row={row} href={`/admin/users/${row.user_id}`} />
          </div>
        </div>
      ),
    },
    { key: 'studio_id', label: 'Studio 模块' },
    {
      key: 'label',
      label: '提示词 / 模型',
      render: (row) => (
        <div className="max-w-[280px]">
          <p className="truncate text-xs font-semibold text-ink">{row.label || '无描述'}</p>
          <p className="mt-0.5 text-[11px] text-brand-hover font-mono">{row.model || row.provider || '默认引擎'}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: '状态 / 诊断',
      render: (row) => {
        const isSuccess = row.status === 'succeeded' || row.status === 'completed' || row.status === 'success';
        return (
          <div>
            <StatusBadge tone={isSuccess ? 'good' : 'danger'}>
              {row.status}
            </StatusBadge>
            {!isSuccess && (row.error_reason || row.error_code) && (
              <p className="mt-1 max-w-[200px] truncate text-[11px] text-danger font-mono" title={row.error_reason || row.error_code}>
                {row.error_reason || row.error_code}
              </p>
            )}
            {row.duration_ms ? (
              <p className="mt-0.5 text-micro text-ink-subtle font-mono">
                耗时: {(row.duration_ms / 1000).toFixed(1)}s
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      key: 'costs',
      label: '额度 / 成本(USD)',
      render: (row) => (
        <div>
          <span className="font-mono font-bold text-brand-hover">{row.credit_cost} Credits</span>
          <p className="text-[11px] font-mono text-warning">
            ${Number(row.actual_cost_usd || 0).toFixed(3)}
          </p>
        </div>
      ),
    },
    {
      key: 'result_url',
      label: '生成产物',
      render: (row) =>
        row.result_url ? (
          <a
            href={row.result_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-line bg-wash px-2.5 py-1 text-xs text-brand-hover hover:bg-brand-soft"
          >
            打开查看 ↗
          </a>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
    },
    {
      key: 'created_at',
      label: '提交时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="内容与任务"
        title="生成任务"
        description="检索平台所有通过 AI Studio 提交的图像、视频和语音生成任务记录及额度扣减情况。"
      >
        <Link
          href="/admin/generations/failures"
          className="rounded-xl border border-warning-line bg-warning-soft px-4 py-2 text-xs font-bold text-warning hover:bg-warning-soft"
        >
          查看失败任务聚类排查 →
        </Link>
      </PageHeader>

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索任务 ID、用户 UID、邮箱、提示词或模型…"
            className="min-w-[240px] flex-1 rounded-xl border border-line bg-scrim px-4 py-2.5 text-xs text-ink outline-none focus:border-brand-ring"
          />

          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs text-ink-muted outline-none focus:border-brand-ring"
          >
            <option value="">全部状态</option>
            <option value="succeeded">Succeeded (成功)</option>
            <option value="processing">Processing (生成中)</option>
            <option value="queued">Queued (排队中)</option>
            <option value="failed">Failed (失败)</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-ink-on-accent hover:bg-brand"
          >
            筛选任务
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="未找到匹配的生成任务记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
