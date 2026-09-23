import Link from 'next/link';
import { listUsers } from '@/lib/services/adminRead';
import { toSearchParams } from '@/lib/admin/pagination';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, DataTable, PageHeader, Pagination, StatusBadge } from '@/components/admin/AdminUi';
import { UserSubject } from '@/components/admin/UserSubject';
import ExportButton from '@/components/admin/ExportButton';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { GoogleIcon, XIcon, TikTokIcon, WeChatIcon, PhoneIcon, MailIcon } from '@/components/SocialIcons';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

function renderProviderBadges(providers = []) {
  if (!providers || providers.length === 0) {
    return <span className="text-ink-subtle text-caption">—</span>;
  }
  const iconMap = {
    phone: { label: '手机', icon: <PhoneIcon className="size-3 text-success" />, color: 'bg-success-soft text-success border-success-line' },
    email: { label: '邮箱', icon: <MailIcon className="size-3 text-info" />, color: 'bg-info-soft text-info border-info-line' },
    google: { label: 'Google', icon: <GoogleIcon className="size-3" />, color: 'bg-brand-soft text-brand border-brand-line' },
    wechat: { label: '微信', icon: <WeChatIcon className="size-3 text-success" />, color: 'bg-success-soft text-success border-success-line' },
    tiktok: { label: 'TikTok', icon: <TikTokIcon className="size-3" />, color: 'bg-wash-strong text-ink border-line' },
    x: { label: 'X', icon: <XIcon className="size-2.5 text-ink" />, color: 'bg-wash-strong text-ink border-line' },
  };

  return (
    <div className="flex flex-wrap gap-1">
      {providers.map((p) => {
        const item = iconMap[p] || { label: p, icon: <span className="text-micro">🔗</span>, color: 'bg-wash text-ink-muted border-line-subtle' };
        return (
          <span
            key={p}
            className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-micro font-medium ${item.color}`}
          >
            <span className="flex items-center shrink-0">{item.icon}</span>
            <span>{item.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function renderTagBadges(tags = []) {
  if (!tags || tags.length === 0) {
    return <span className="text-ink-subtle text-caption">无标签</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-micro font-medium text-ink shadow-elevation-1"
          style={{ backgroundColor: `${t.color}25`, borderColor: `${t.color}50`, borderWidth: 1 }}
        >
          <span className="size-1.5 rounded-full" style={{ backgroundColor: t.color }} />
          <span>{t.name}</span>
        </span>
      ))}
    </div>
  );
}

export default async function UsersPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.usersRead);
  const params = toSearchParams(await searchParams);
  const result = await listUsers(params);

  const columns = [
    {
      key: 'user_info',
      label: '用户主体',
      render: (row) => <UserSubject row={row} href={`/admin/users/${row.id}`} />,
    },
    {
      key: 'login_providers',
      label: '绑定登录凭据',
      render: (row) => renderProviderBadges(row.loginProviders),
    },
    {
      key: 'tags',
      label: '运营标签',
      render: (row) => renderTagBadges(row.tags),
    },
    {
      key: 'role',
      label: '角色',
      render: (row) => (
        <StatusBadge tone={row.role === 'user' ? 'neutral' : 'info'}>
          {roleLabel(row.role)}
        </StatusBadge>
      ),
    },
    {
      key: 'status',
      label: '账户状态',
      render: (row) => (
        <StatusBadge tone={row.status === 'suspended' ? 'danger' : 'good'}>
          {row.status === 'suspended' ? '已封禁' : '正常'}
        </StatusBadge>
      ),
    },
    {
      key: 'credits',
      label: '模型额度',
      render: (row) => (
        <span className="font-mono font-semibold text-brand tabular-nums">{row.credits}</span>
      ),
    },
    {
      key: 'created_at',
      label: '注册 / 最近登录',
      render: (row) => (
        <div className="text-body-sm">
          <p className="text-ink-muted">{formatDate(row.created_at)}</p>
          <p className="text-ink-subtle text-caption mt-0.5">
            最近: {formatDate(row.last_login_at)}
          </p>
        </div>
      ),
    },
    {
      key: 'action',
      label: '操作',
      render: (row) => (
        <Link
          href={`/admin/users/${row.id}`}
          className="h-control-xs inline-flex items-center rounded-sm border border-line-subtle bg-raised px-2.5 text-micro font-medium text-brand transition-[background-color,border-color,color] duration-fast hover:border-brand-line hover:bg-brand-soft"
        >
          查看画像与运营 →
        </Link>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="用户与权限"
        title="用户运营管理"
        description="检索平台多渠道注册用户，查看绑定凭据、运营标签、模型额度，并执行封禁、调额与打标。"
      >
        <ExportButton type="users" label="导出用户 CSV" />
      </PageHeader>

      {/* 搜索与多维筛选工具栏 */}
      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索用户 UID、邮箱、手机号或昵称…"
            className="min-w-[240px] flex-1 rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
          />

          {/* 登录渠道筛选 */}
          <select
            name="provider"
            defaultValue={params.get('provider') || ''}
            className="rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
          >
            <option value="">全部登录方式</option>
            <option value="phone">📱 手机短信</option>
            <option value="email">✉️ 邮箱密码</option>
            <option value="google">🔵 Google</option>
            <option value="wechat">💚 微信</option>
            <option value="tiktok">🎵 TikTok</option>
            <option value="x">𝕏 X (Twitter)</option>
          </select>

          {/* 运营标签筛选 */}
          <select
            name="tag"
            defaultValue={params.get('tag') || ''}
            className="rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
          >
            <option value="">全部运营标签</option>
            <option value="tag_new">🟢 新用户</option>
            <option value="tag_active">🔵 活跃用户</option>
            <option value="tag_paying">🟣 付费用户</option>
            <option value="tag_vip">🟡 高价值用户</option>
            <option value="tag_churn">🔴 流失风险</option>
            <option value="tag_test">⚪ 测试用户</option>
          </select>

          {/* 角色筛选 */}
          <select
            name="role"
            defaultValue={params.get('role') || ''}
            className="rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
          >
            <option value="">全部角色</option>
            <option value="user">普通用户</option>
            <option value="super_admin">超级管理员</option>
            <option value="operations_admin">运营管理员</option>
            <option value="finance_admin">财务管理员</option>
            <option value="support_admin">支持管理员</option>
            <option value="auditor">审计只读</option>
          </select>

          {/* 状态筛选 */}
          <select
            name="status"
            defaultValue={params.get('status') || ''}
            className="rounded-md border border-line-subtle bg-well px-3 h-control-md text-body-sm text-ink outline-none focus-visible:ring-1 focus-visible:ring-brand-ring focus:border-brand-ring transition-[border-color,box-shadow] duration-fast"
          >
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="suspended">已封禁</option>
          </select>

          <button
            type="submit"
            className="h-control-md rounded-md bg-brand px-5 text-body-sm font-semibold text-ink-on-accent transition-colors duration-fast hover:bg-brand-hover"
          >
            筛选
          </button>

          {Array.from(params.keys()).length > 0 && (
            <Link
              href="/admin/users"
              className="h-control-md inline-flex items-center rounded-md border border-line-subtle bg-raised px-3 text-body-sm text-ink-muted transition-[border-color,background-color,color] duration-fast hover:border-line hover:bg-overlay hover:text-ink"
            >
              重置
            </Link>
          )}
        </form>
      </Card>

      <DataTable columns={columns} rows={result.rows} empty="未找到匹配的用户记录" />
      <Pagination meta={result.meta} searchParams={params} />
    </>
  );
}
