import Link from 'next/link';
import { getFailureClusters, listFailedCreations } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { UserSubject } from '@/components/admin/UserSubject';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import AdminActionForm from '@/components/admin/AdminActionForm';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function FailedGenerationsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.generationsRead);
  const params = toSearchParams(await searchParams);
  const clusters = await getFailureClusters();
  const result = await listFailedCreations(params);

  const columns = [
    {
      key: 'id',
      label: '失败任务 ID / 用户',
      render: (row) => (
        <div>
          <CopyableId id={row.id} />
          <div className="mt-1">
            <UserSubject row={row} href={`/admin/users/${row.user_id}`} />
          </div>
        </div>
      ),
    },
    { key: 'studio_id', label: 'Studio' },
    {
      key: 'error_code',
      label: '错误代码 / 聚类',
      render: (row) => (
        <span className="rounded-md border border-danger-line bg-danger-soft px-2 py-0.5 font-mono text-xs text-danger">
          {row.error_code || 'UNKNOWN_ERROR'}
        </span>
      ),
    },
    { key: 'model', label: '请求模型', render: (row) => row.model || '—' },
    {
      key: 'created_at',
      label: '失败时间',
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'action',
      label: '受控重试操作',
      render: (row) => (
        <AdminActionForm
          action={`/api/admin/generations/${row.id}/retry`}
          method="POST"
          fields={[]}
          label="重新派发生成"
          tone="primary"
          confirmMessage="确认重新派发该任务？系统将新建一个关联子任务，原失败记录予以保留。"
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="内容与任务"
        title="失败任务排查"
        description="分析 AI 模型超时、供应商鉴权失败等异常原因。支持通过错误代码聚类定位故障并进行幂等安全重试。"
      >
        <Link
          href="/admin/generations"
          className="h-control-md inline-flex items-center rounded-md border border-line-subtle bg-raised px-3.5 text-body-sm font-medium text-ink-muted transition-[background-color,border-color,color] duration-fast hover:border-line hover:bg-overlay hover:text-ink"
        >
          ← 返回全部生成任务
        </Link>
      </PageHeader>

      {/* 错误代码聚类卡片 */}
      <Card className="mb-6">
        <h2 className="text-card-title font-semibold text-ink mb-3">当前失败错误分类聚类 (Top 10)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {clusters.length ? (
            clusters.map((c) => (
              <div key={c.code} className="rounded-lg border border-line-subtle bg-well p-3.5">
                <p className="font-mono text-mono font-semibold text-danger truncate">{c.code}</p>
                <p className="mt-2 text-2xl font-semibold tabular-nums text-ink">{c.count} 次</p>
                <p className="mt-1 text-micro text-ink-subtle">最近发生：{formatDate(c.last_occurred_at)}</p>
              </div>
            ))
          ) : (
            <p className="text-body-sm text-ink-subtle col-span-full py-4 text-center">当前暂无失败错误聚类记录</p>
          )}
        </div>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="当前没有检测到失败的生成任务" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
