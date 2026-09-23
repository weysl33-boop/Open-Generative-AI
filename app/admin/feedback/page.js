import { listFeedbackForAdmin } from '@/lib/services/feedback';
import { FEEDBACK_KINDS, FEEDBACK_STATUS_LABELS } from '@/lib/feedback/catalog';
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

const KIND_LABELS = Object.fromEntries(FEEDBACK_KINDS.map((kind) => [kind.id, kind.label]));

export default async function FeedbackPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.feedbackRead);
  const params = toSearchParams(await searchParams);
  const result = await listFeedbackForAdmin(params);

  const columns = [
    {
      key: 'id',
      label: '提交编号',
      render: (row) => <CopyableId id={row.id} label="提交" />,
    },
    {
      key: 'user',
      label: '提交人',
      render: (row) => <UserSubject row={row} href={`/admin/users/${row.user_id}`} />,
    },
    {
      key: 'kind',
      label: '类型',
      render: (row) => (
        <StatusBadge tone={row.kind === 'security' ? 'danger' : row.kind === 'improvement' ? 'good' : 'warn'}>
          {KIND_LABELS[row.kind] || row.kind}
        </StatusBadge>
      ),
    },
    {
      key: 'content',
      label: '标题与描述',
      render: (row) => (
        <div className="max-w-[420px]">
          <p className="text-label font-semibold text-ink">{row.title}</p>
          {row.page_url ? (
            <p className="text-caption text-ink-subtle font-mono mt-0.5 break-all">{row.page_url}</p>
          ) : null}
          <p className="text-caption text-ink-muted mt-1 leading-relaxed whitespace-pre-wrap">{row.detail}</p>
        </div>
      ),
    },
    {
      key: 'status',
      label: '审核状态',
      render: (row) => (
        <StatusBadge tone={row.status === 'accepted' ? 'good' : row.status === 'rejected' ? 'danger' : 'warn'}>
          {FEEDBACK_STATUS_LABELS[row.status] || row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'reward_coins',
      label: '发放硬币',
      render: (row) => (
        <div className="text-label font-mono text-ink">
          🪙 {Number(row.reward_coins || 0)}
          {row.review_note ? <p className="text-caption text-ink-subtle font-sans mt-0.5">{row.review_note}</p> : null}
        </div>
      ),
    },
    { key: 'created_at', label: '提交时间', render: (row) => formatDate(row.created_at) },
    {
      key: 'action',
      label: '人工裁决',
      render: (row) =>
        row.status === 'pending' ? (
          <div className="flex flex-col gap-2">
            <AdminActionForm
              action={`/api/admin/feedback/${row.id}/review`}
              method="POST"
              fields={[
                { name: 'resolution', defaultValue: 'accepted', type: 'hidden' },
                {
                  name: 'rewardCoins',
                  type: 'number',
                  defaultValue: String(FEEDBACK_KINDS.find((kind) => kind.id === row.kind)?.rewardDefault ?? 1),
                  placeholder: '发放枚数',
                },
                { name: 'note', placeholder: '采纳说明（选填）', required: false },
              ]}
              label="采纳并发币"
              tone="primary"
              confirmMessage="确认采纳该提交并向用户发放硬币？操作会写入硬币账本与审计日志。"
            />
            <AdminActionForm
              action={`/api/admin/feedback/${row.id}/review`}
              method="POST"
              fields={[
                { name: 'resolution', defaultValue: 'rejected', type: 'hidden' },
                { name: 'note', placeholder: '未采纳原因', required: true },
              ]}
              label="未采纳"
              tone="danger"
              confirmMessage="确认判定为无效提交？不会发放硬币。"
            />
          </div>
        ) : (
          <span className="text-label text-ink-subtle">已于 {formatDate(row.reviewed_at)} 处理</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="内容与任务"
        title="建议与漏洞提交"
        description="站内硬币的第二条获取渠道：用户提交的报错、体验改善建议与安全漏洞。只有判定为有效才会发放硬币，一笔提交只会发放一次。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
          >
            <option value="">全部状态</option>
            <option value="pending">待审核</option>
            <option value="accepted">已采纳</option>
            <option value="rejected">未采纳</option>
          </select>
          <select
            name="kind"
            defaultValue={params.get('kind') || ''}
            className="h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink outline-none transition focus-visible:border-brand focus-visible:ring-1 focus-visible:ring-brand-ring"
          >
            <option value="">全部类型</option>
            {FEEDBACK_KINDS.map((kind) => (
              <option key={kind.id} value={kind.id}>
                {kind.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="h-control-md rounded-md bg-brand px-5 text-body-sm font-medium text-ink-on-accent transition hover:bg-brand-hover active:bg-brand-active"
          >
            筛选队列
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="当前没有待处理的建议提交" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
