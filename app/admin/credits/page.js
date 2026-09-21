import { listCreditLedger } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, CopyableId } from '@/components/admin/AdminUi';
import { UserSubject } from '@/components/admin/UserSubject';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function CreditsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.creditsRead);
  const params = toSearchParams(await searchParams);
  const result = await listCreditLedger(params);

  const columns = [
    {
      key: 'user',
      label: '目标用户',
      render: (row) => (
        <div>
          <UserSubject row={row} href={`/admin/users/${row.user_id}`} />
          <div className="mt-1">
            <CopyableId id={row.id} label="流水 ID" />
          </div>
        </div>
      ),
    },
    {
      key: 'bucket_type',
      label: '资产账户',
      render: (row) => {
        const type = String(row.bucket_type || '').toLowerCase();
        if (type === 'subscription') {
          return <span className="rounded-md border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-[11px] font-semibold text-purple-300">💎 订阅专属额度</span>;
        }
        if (type === 'perpetual') {
          return <span className="rounded-md border border-brand-line bg-brand-soft px-2 py-0.5 text-[11px] font-semibold text-brand-hover">⚡ 通用充值积分</span>;
        }
        if (type === 'currency' || type === 'k_coin') {
          return <span className="rounded-md border border-warning-line bg-warning-soft px-2 py-0.5 text-[11px] font-semibold text-warning">🪙 平台硬币</span>;
        }
        return <span className="rounded-md border border-success-line bg-success-soft px-2 py-0.5 text-[11px] font-semibold text-success">🎁 每日免费</span>;
      },
    },
    {
      key: 'delta',
      label: '变动量',
      render: (row) => (
        <span className={`font-mono font-bold text-sm ${row.delta > 0 ? 'text-success' : 'text-danger'}`}>
          {row.delta > 0 ? `+${row.delta}` : row.delta}
        </span>
      ),
    },
    {
      key: 'balance_after',
      label: '变动后结余',
      render: (row) => (
        <span className="font-mono text-xs text-ink-muted">
          {row.balance_after !== null && row.balance_after !== undefined ? row.balance_after : '—'}
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
          <span className="text-ink-subtle">系统自动</span>
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
        eyebrow="计费与资产中枢"
        title="额度与资产账本"
        description="不可篡改的追加型资产流水明细。区分订阅专属额度、通用充值积分与平台硬币流动。"
      />

      {/* 资产三元架构概览卡片 */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        <Card className="border-purple-500/20 bg-purple-500/[0.03]">
          <div className="flex items-center gap-2 text-purple-300 font-bold text-sm">
            <span>💎 订阅专属额度 (Subscription Quota)</span>
          </div>
          <p className="mt-2 text-xs text-ink-muted leading-relaxed">
            订阅制专属资产，按月或按年随套餐发放，具备账单周期自动重置机制。在所有 AI 生成任务中享有<strong>最高抵扣优先级</strong>。
          </p>
        </Card>

        <Card className="border-brand-soft bg-brand-soft">
          <div className="flex items-center gap-2 text-brand-hover font-bold text-sm">
            <span>⚡ 通用算力积分 (Credits)</span>
          </div>
          <p className="mt-2 text-xs text-ink-muted leading-relaxed">
            平台通用按量算力，永久有效不过期。通过卡密充值、每日签到或单独购买获取，在订阅额度耗尽后自动作为次级池无缝补足扣除。
          </p>
        </Card>

        <Card className="border-warning-soft bg-warning-soft">
          <div className="flex items-center gap-2 text-warning font-bold text-sm">
            <span>🪙 平台硬币钱包 (硬币)</span>
          </div>
          <p className="mt-2 text-xs text-ink-muted leading-relaxed">
            网站独有的通用结算代币（1 元 = 10 硬币），支持复式记账与安全支付密码，专门用于购买订阅套餐、兑换积分及创作者生态结算。
          </p>
        </Card>
      </div>

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索用户 UID、邮箱、变动原因或关联单号…"
            className="min-w-[240px] flex-1 rounded-xl border border-line bg-scrim px-4 py-2.5 text-xs text-ink outline-none focus:border-brand-ring"
          />
          <button
            type="submit"
            className="rounded-xl bg-brand px-5 py-2.5 text-xs font-bold text-ink-on-accent hover:bg-brand transition shadow-elevation-2 shadow-brand-soft"
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
