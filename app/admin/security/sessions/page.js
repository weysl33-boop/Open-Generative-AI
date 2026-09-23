import { listActiveSessions } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { UserSubject } from '@/components/admin/UserSubject';
import AdminActionForm from '@/components/admin/AdminActionForm';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function SessionsPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.sessionsRevoke);
  const params = toSearchParams(await searchParams);
  const result = await listActiveSessions(params);

  const columns = [
    {
      key: 'email',
      label: '账户 / 角色',
      render: (row) => (
        <div>
          <UserSubject row={row} href={`/admin/users/${row.user_id}`} />
          <div className="mt-1 flex items-center gap-2">
            <StatusBadge tone={row.role === 'user' ? 'neutral' : 'info'}>
              {roleLabel(row.role)}
            </StatusBadge>
            <CopyableId id={row.user_id} label="内部记录 ID" />
          </div>
        </div>
      ),
    },
    {
      key: 'token_hash',
      label: '会话 Token 哈希',
      render: (row) => <CopyableId id={row.token_hash} />,
    },
    {
      key: 'created_at',
      label: '登录创建时间',
      render: (row) => formatDate(row.created_at),
    },
    {
      key: 'expires_at',
      label: '凭据有效期至',
      render: (row) => (
        <span className="text-ink-muted">{formatDate(row.expires_at)}</span>
      ),
    },
    {
      key: 'action',
      label: '操作',
      render: (row) => (
        <AdminActionForm
          action={`/api/admin/users/${row.user_id}/sessions/revoke`}
          method="POST"
          fields={[]}
          label="强制下线"
          tone="danger"
          confirmMessage="确认强制撤销该用户的所有活跃会话？"
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="用户与权限"
        title="会话与安全"
        description="实时监控平台所有有效登录会话。支持按照用户邮箱快速定位，并在检测到异常时一键强制注销会话。"
      />

      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索用户 UID、邮箱或内部记录 ID…"
            className="min-w-[240px] flex-1 rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
          />
          <button
            type="submit"
            className="h-control-md rounded-md bg-brand px-5 text-body-sm font-semibold text-ink-on-accent transition-colors duration-fast hover:bg-brand-hover"
          >
            查询会话
          </button>
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="当前没有匹配的有效会话" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
