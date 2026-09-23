import { listCoupons } from '@/lib/services/coupons';
import { toSearchParams } from '@/lib/admin/pagination';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import CouponGeneratorClient from './CouponGeneratorClient';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function CouponsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.couponsRead);
  const params = toSearchParams(await searchParams);
  const result = await listCoupons(params);

  const columns = [
    {
      key: 'code',
      label: '兑换码 / 卡密',
      render: (row) => (
        <div className="font-mono font-bold text-brand-hover">
          <CopyableId id={row.code} />
        </div>
      ),
    },
    {
      key: 'type',
      label: '权益类型',
      render: (row) => (
        <StatusBadge tone={row.type === 'credits' ? 'info' : 'good'}>
          {row.type === 'credits' ? '算力点卡' : '会员方案'}
        </StatusBadge>
      ),
    },
    {
      key: 'value',
      label: '对应面值',
      render: (row) => (
        <span className="font-bold text-ink">
          {row.type === 'credits' ? `+${row.value} 额度` : `${row.value.toUpperCase()} 会员`}
        </span>
      ),
    },
    {
      key: 'usage',
      label: '使用进度',
      render: (row) => {
        const isFull = row.used_count >= row.max_uses;
        return (
          <span className={`text-xs font-mono font-medium ${isFull ? 'text-ink-subtle' : 'text-success'}`}>
            {row.used_count} / {row.max_uses} {isFull ? '(已满)' : ''}
          </span>
        );
      },
    },
    {
      key: 'status',
      label: '可用状态',
      render: (row) => {
        const isExpired = row.expires_at && new Date(row.expires_at).getTime() < Date.now();
        const isFull = row.used_count >= row.max_uses;
        if (row.is_active === 0) return <StatusBadge tone="danger">已停用</StatusBadge>;
        if (isExpired) return <StatusBadge tone="warn">已过期</StatusBadge>;
        if (isFull) return <StatusBadge tone="neutral">已核销</StatusBadge>;
        return <StatusBadge tone="good">正常有效</StatusBadge>;
      },
    },
    {
      key: 'created_at',
      label: '创建时间',
      render: (row) => formatDate(row.created_at),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="商业化运营"
        title="卡密与兑换码"
        description="管理推广分发兑换码、算力充值点卡与会员激活卡密，支持单批次一键批量生成与实时核销审计。"
      />

      <CouponGeneratorClient />

      <div className="space-y-4">
        <DataTable columns={columns} rows={result.rows} empty="暂无兑换码记录" />
        <Pagination meta={result.meta} />
      </div>
    </>
  );
}
