import Link from 'next/link';
import { listOrders } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import AdminActionForm from '@/components/admin/AdminActionForm';
import ExportButton from '@/components/admin/ExportButton';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function OrdersPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.billingRead);
  const params = toSearchParams(await searchParams);
  const result = await listOrders(params);

  const columns = [
    {
      key: 'id',
      label: '系统单号 / 外部流水号',
      render: (row) => (
        <div>
          <CopyableId id={row.id} />
          {row.provider_order_id && (
            <div className="mt-1 text-[11px] text-ink-subtle">
              外部: <CopyableId id={row.provider_order_id} />
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'user',
      label: '支付用户',
      render: (row) => (
        <Link href={`/admin/users/${row.user_id}`} className="font-semibold text-ink hover:text-brand-hover">
          {row.email}
        </Link>
      ),
    },
    { key: 'provider', label: '渠道' },
    {
      key: 'amount',
      label: '金额',
      render: (row) => (
        <span className="font-mono font-bold text-ink">
          {(row.amount_minor / 100).toFixed(2)} {row.currency}
        </span>
      ),
    },
    {
      key: 'status',
      label: '支付状态',
      render: (row) => (
        <StatusBadge
          tone={
            row.status === 'paid' || row.status === 'completed'
              ? 'good'
              : row.status === 'refunded'
              ? 'danger'
              : 'warn'
          }
        >
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'created_at',
      label: '下单时间',
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'action',
      label: '退款操作',
      render: (row) =>
        row.status === 'paid' ? (
          <AdminActionForm
            action={`/api/admin/orders/${row.id}/refund`}
            method="POST"
            fields={[{ name: 'reason', placeholder: '退款原因说明', required: true }]}
            label="退款"
            tone="danger"
            confirmMessage="确认对该订单执行退款？此操作将立即变更订单状态并追加审计记录。"
          />
        ) : row.status === 'refunded' ? (
          <span className="text-xs text-ink-subtle">已退款</span>
        ) : (
          <span className="text-xs text-ink-subtle">—</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="计费与权益"
        title="订单与支付"
        description="查看全平台交易订单、渠道支付结果与结算流水，可按需发起原路退款或补发权益。"
      >
        <ExportButton type="orders" label="导出订单 CSV" />
      </PageHeader>

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索订单号、外部流水号或邮箱…"
            className="min-w-[240px] flex-1 rounded-xl border border-line bg-scrim px-4 py-2.5 text-xs text-ink outline-none focus:border-brand-ring"
          />

          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs text-ink-muted outline-none focus:border-brand-ring"
          >
            <option value="">全部状态</option>
            <option value="pending">待支付 (pending)</option>
            <option value="paid">已支付 (paid)</option>
            <option value="refunded">已退款 (refunded)</option>
          </select>

          <select
            name="provider"
            defaultValue={params.get('provider') || ''}
            className="rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs text-ink-muted outline-none focus:border-brand-ring"
          >
            <option value="">全部渠道</option>
            <option value="wechat">微信支付</option>
            <option value="alipay">支付宝</option>
            <option value="stripe">Stripe</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-ink-on-accent hover:bg-brand"
          >
            筛选
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="未找到匹配的订单记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
