import Link from 'next/link';
import { listModerationCases } from '@/lib/repositories/moderation';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import AdminActionForm from '@/components/admin/AdminActionForm';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function ModerationPage({ searchParams }) {
  const params = toSearchParams(await searchParams);
  const result = await listModerationCases(params);

  const columns = [
    {
      key: 'id',
      label: '审核案件 / 生成 ID',
      render: (row) => (
        <div>
          <CopyableId id={row.id} label="案件" />
          <div className="mt-1">
            <CopyableId id={row.creation_id} label="产物" />
          </div>
        </div>
      ),
    },
    {
      key: 'user',
      label: '作者账号',
      render: (row) => (
        <Link href={`/admin/users/${row.user_id}`} className="font-semibold text-white hover:text-cyan-200">
          {row.email}
        </Link>
      ),
    },
    {
      key: 'preview',
      label: '产物预览',
      render: (row) =>
        row.result_url ? (
          <a
            href={row.result_url}
            target="_blank"
            rel="noreferrer"
            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-cyan-200 hover:bg-cyan-300/10"
          >
            查看文件 ↗
          </a>
        ) : (
          <span className="text-white/30 text-xs">—</span>
        ),
    },
    {
      key: 'status',
      label: '审核状态',
      render: (row) => (
        <StatusBadge
          tone={
            row.status === 'approved'
              ? 'good'
              : row.status === 'rejected'
              ? 'danger'
              : 'warn'
          }
        >
          {row.status}
        </StatusBadge>
      ),
    },
    { key: 'reason_code', label: '标记原因' },
    {
      key: 'created_at',
      label: '送审时间',
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'action',
      label: '人工裁决',
      render: (row) =>
        row.status === 'pending' ? (
          <div className="flex items-center gap-2">
            <AdminActionForm
              action={`/api/admin/moderation/${row.id}/resolve`}
              method="POST"
              fields={[
                { name: 'resolution', defaultValue: 'approved', type: 'hidden' },
                { name: 'notes', placeholder: '批注（选填）', required: false },
              ]}
              label="放行"
              tone="primary"
              confirmMessage="确认放行该生成内容？"
            />
            <AdminActionForm
              action={`/api/admin/moderation/${row.id}/resolve`}
              method="POST"
              fields={[
                { name: 'resolution', defaultValue: 'rejected', type: 'hidden' },
                { name: 'notes', placeholder: '下架原因说明', required: true },
              ]}
              label="违规下架"
              tone="danger"
              confirmMessage="确认违规下架该内容？产物将被置为违规不可见。"
            />
          </div>
        ) : (
          <span className="text-xs text-white/40">已处理 ({row.resolution})</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="内容与任务"
        title="内容审核"
        description="监管 AI Studio 用户生成的图像、视频内容安全与合规性。支持人工复核、放行或违规下架封禁。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-4 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
          >
            <option value="">全部审核状态</option>
            <option value="pending">待审核 (Pending)</option>
            <option value="approved">已放行 (Approved)</option>
            <option value="rejected">已违规下架 (Rejected)</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-200"
          >
            筛选队列
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="当前审核队列为空，所有内容均合规" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
