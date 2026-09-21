import { listSubscriptions } from '@/lib/services/adminRead';
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

export default async function SubscriptionsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.billingRead);
  const params = toSearchParams(await searchParams);
  const result = await listSubscriptions(params);

  const columns = [
    {
      key: 'user',
      label: '订阅用户',
      render: (row) => (
        <div>
          <UserSubject row={row} href={`/admin/users/${row.user_id}`} />
          <div className="mt-1">
            <CopyableId id={row.id} label="订阅号" />
          </div>
        </div>
      ),
    },
    { key: 'provider', label: '支付渠道' },
    { key: 'plan_id', label: '套餐 ID' },
    {
      key: 'status',
      label: '状态',
      render: (row) => (
        <StatusBadge tone={row.status === 'active' ? 'good' : row.status === 'past_due' ? 'danger' : 'warn'}>
          {row.status}
        </StatusBadge>
      ),
    },
    {
      key: 'current_period_end',
      label: '周期到期时间',
      render: (row) => formatDate(row.current_period_end),
    },
    {
      key: 'updated_at',
      label: '最近同步时间',
      render: (row) => formatDate(row.updated_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="计费与权益"
        title="订阅管理"
        description="管理平台用户的周期性订阅（包含 Stripe 等海外代扣订阅），查看周期到期时间与生效状态。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索用户 UID、邮箱或订阅 ID…"
            className="min-w-[240px] flex-1 rounded-xl border border-line bg-scrim px-4 py-2.5 text-xs text-ink outline-none focus:border-brand-ring"
          />

          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-xl border border-line bg-canvas px-3 py-2.5 text-xs text-ink-muted outline-none focus:border-brand-ring"
          >
            <option value="">全部状态</option>
            <option value="active">Active (正常)</option>
            <option value="trialing">Trialing (试用)</option>
            <option value="past_due">Past Due (逾期)</option>
            <option value="canceled">Canceled (已取消)</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-ink-on-accent hover:bg-brand"
          >
            筛选
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="未找到匹配的订阅记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
