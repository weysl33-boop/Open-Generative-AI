import Link from 'next/link';
import { listSubscriptions } from '@/lib/repositories/billing';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function SubscriptionsPage({ searchParams }) {
  const params = toSearchParams(await searchParams);
  const result = await listSubscriptions(params);

  const columns = [
    {
      key: 'user',
      label: '用户邮箱',
      render: (row) => (
        <div>
          <Link href={`/admin/users/${row.user_id}`} className="font-semibold text-white hover:text-cyan-200">
            {row.email}
          </Link>
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
            placeholder="搜索用户邮箱、订阅 ID…"
            className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50"
          />

          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
          >
            <option value="">全部状态</option>
            <option value="active">Active (正常)</option>
            <option value="trialing">Trialing (试用)</option>
            <option value="past_due">Past Due (逾期)</option>
            <option value="canceled">Canceled (已取消)</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-200"
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
