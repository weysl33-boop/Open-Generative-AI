import Link from 'next/link';
import { listFailedCreations, getFailureClusters } from '@/lib/repositories/creations';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import AdminActionForm from '@/components/admin/AdminActionForm';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function FailedGenerationsPage({ searchParams }) {
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
            <Link href={`/admin/users/${row.user_id}`} className="text-xs text-white/50 hover:text-cyan-200">
              {row.email}
            </Link>
          </div>
        </div>
      ),
    },
    { key: 'studio_id', label: 'Studio' },
    {
      key: 'error_code',
      label: '错误代码 / 聚类',
      render: (row) => (
        <span className="rounded-md border border-red-400/30 bg-red-400/10 px-2 py-0.5 font-mono text-xs text-red-200">
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
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
        >
          ← 返回全部生成任务
        </Link>
      </PageHeader>

      {/* 错误代码聚类卡片 */}
      <Card className="mb-6">
        <h2 className="text-sm font-bold text-white mb-3">当前失败错误分类聚类 (Top 10)</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {clusters.length ? (
            clusters.map((c) => (
              <div key={c.code} className="rounded-xl border border-white/[0.08] bg-black/30 p-3.5">
                <p className="font-mono text-xs font-bold text-red-300 truncate">{c.code}</p>
                <p className="mt-2 text-2xl font-extrabold text-white">{c.count} 次</p>
                <p className="mt-1 text-[10px] text-white/35">最近发生：{formatDate(c.last_occurred_at)}</p>
              </div>
            ))
          ) : (
            <p className="text-xs text-white/40 col-span-full py-4 text-center">当前暂无失败错误聚类记录</p>
          )}
        </div>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="当前没有检测到失败的生成任务" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
