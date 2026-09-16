import Link from 'next/link';
import { listCreditLedger } from '@/lib/repositories/credits';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, CopyableId } from '@/components/admin/AdminUi';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function CreditsPage({ searchParams }) {
  const params = toSearchParams(await searchParams);
  const result = await listCreditLedger(params);

  const columns = [
    {
      key: 'user',
      label: '目标用户',
      render: (row) => (
        <div>
          <Link href={`/admin/users/${row.user_id}`} className="font-semibold text-white hover:text-cyan-200">
            {row.email}
          </Link>
          <div className="mt-1">
            <CopyableId id={row.id} label="流水 ID" />
          </div>
        </div>
      ),
    },
    {
      key: 'delta',
      label: '变动量',
      render: (row) => (
        <span className={`font-mono font-bold text-sm ${row.delta > 0 ? 'text-emerald-300' : 'text-red-400'}`}>
          {row.delta > 0 ? `+${row.delta}` : row.delta}
        </span>
      ),
    },
    { key: 'reason', label: '变动原因' },
    {
      key: 'reference_id',
      label: '关联单号 / 任务',
      render: (row) => <CopyableId id={row.reference_id} />,
    },
    {
      key: 'actor_user_id',
      label: '操作人',
      render: (row) =>
        row.actor_user_id ? (
          <CopyableId id={row.actor_user_id} />
        ) : (
          <span className="text-white/40">系统自动</span>
        ),
    },
    {
      key: 'created_at',
      label: '入账时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="计费与权益"
        title="额度账本"
        description="不可篡改的追加型额度流水明细。记录所有用户的额度消耗、购买入账及管理员人工补偿。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索用户邮箱、变动原因或关联单号…"
            className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50"
          />
          <button
            type="submit"
            className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black hover:bg-cyan-200"
          >
            筛选流水
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="暂无匹配的额度账本流水" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
