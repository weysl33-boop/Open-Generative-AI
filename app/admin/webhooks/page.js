import { listWebhookEvents } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import AdminActionForm from '@/components/admin/AdminActionForm';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function WebhooksPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.webhooksRead);
  const params = toSearchParams(await searchParams);
  const result = await listWebhookEvents(params);

  const columns = [
    {
      key: 'event_id',
      label: '外部事件 ID',
      render: (row) => <CopyableId id={row.event_id} />,
    },
    { key: 'provider', label: '供应商渠道' },
    {
      key: 'status',
      label: '处理状态',
      render: (row) => (
        <StatusBadge
          tone={
            row.status === 'processed' || row.status === 'received'
              ? 'good'
              : row.status === 'replayed'
              ? 'info'
              : 'danger'
          }
        >
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'attempts',
      label: '处理重试次数',
      render: (row) => <span className="font-mono text-xs">{row.attempts || 1}</span>,
    },
    {
      key: 'last_error',
      label: '最后一次报错',
      render: (row) =>
        row.last_error ? (
          <span className="truncate max-w-[200px] text-xs text-danger font-mono" title={row.last_error}>
            {row.last_error}
          </span>
        ) : (
          <span className="text-ink-subtle text-xs">无报错</span>
        ),
    },
    {
      key: 'created_at',
      label: '接收时间',
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'action',
      label: '操作',
      render: (row) => (
        <AdminActionForm
          action={`/api/admin/webhooks/${encodeURIComponent(row.event_id)}/replay?provider=${encodeURIComponent(row.provider)}`}
          method="POST"
          fields={[]}
          label="幂等重放"
          tone="secondary"
          confirmMessage="确认重放此 Webhook 事件？系统将按存档报文重新执行渠道履约（不会重新校验厂商签名）。"
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="模型与集成"
        title="Webhook 事件"
        description="查看来自 Stripe、微信、支付宝等外部平台的回调通知、去重记录及异常排障日志。支持受控幂等重放。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <select
            name="provider"
            defaultValue={params.get('provider') || ''}
            className="h-control-md rounded-md border border-line-subtle bg-well px-3 text-body-sm text-ink focus-visible:border-brand focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-brand-ring"
          >
            <option value="">全部渠道</option>
            <option value="stripe">Stripe</option>
            <option value="wechat">微信支付</option>
            <option value="alipay">支付宝</option>
          </select>

          <button
            type="submit"
            className="h-control-md rounded-md bg-brand hover:bg-brand-hover active:bg-brand-active px-4 text-body-sm font-semibold text-ink-on-accent transition-colors"
          >
            筛选记录
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="当前暂无 Webhook 事件记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
