import Link from 'next/link';
import { listUsers } from '@/lib/repositories/users';
import { toSearchParams } from '@/lib/admin/pagination';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, DataTable, PageHeader, Pagination, StatusBadge, CopyableId } from '@/components/admin/AdminUi';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

function renderProviderBadges(providers = []) {
  if (!providers || providers.length === 0) {
    return <span className="text-white/30 text-xs">—</span>;
  }
  const iconMap = {
    phone: { label: '手机', icon: '📱', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
    email: { label: '邮箱', icon: '✉️', color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
    google: { label: 'Google', icon: '🔵', color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
    tiktok: { label: 'TikTok', icon: '🎵', color: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
    x: { label: 'X', icon: '𝕏', color: 'bg-white/10 text-white/90 border-white/20' },
  };

  return (
    <div className="flex flex-wrap gap-1">
      {providers.map((p) => {
        const item = iconMap[p] || { label: p, icon: '🔗', color: 'bg-white/10 text-white border-white/20' };
        return (
          <span
            key={p}
            className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${item.color}`}
          >
            <span>{item.icon}</span>
            <span>{item.label}</span>
          </span>
        );
      })}
    </div>
  );
}

function renderTagBadges(tags = []) {
  if (!tags || tags.length === 0) {
    return <span className="text-white/30 text-xs">无标签</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {tags.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white shadow-sm"
          style={{ backgroundColor: `${t.color}25`, borderColor: `${t.color}50`, borderWidth: 1 }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: t.color }} />
          <span>{t.name}</span>
        </span>
      ))}
    </div>
  );
}

export default async function UsersPage({ searchParams }) {
  const params = toSearchParams(await searchParams);
  const result = await listUsers(params);

  const columns = [
    {
      key: 'user_info',
      label: '用户主体',
      render: (row) => (
        <div>
          <p className="font-semibold text-white">
            {row.display_name || (row.phone ? `用户${row.phone.slice(-4)}` : row.email?.split('@')[0])}
          </p>
          <div className="mt-0.5 text-xs text-white/50 space-y-0.5">
            {row.email && <div>✉️ {row.email}</div>}
            {row.phone && <div>📱 {row.phone_country_code || '+86'} {row.phone}</div>}
          </div>
          <div className="mt-1">
            <CopyableId id={row.id} />
          </div>
        </div>
      ),
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
        <span className="font-mono font-bold text-cyan-200">{row.credits}</span>
      ),
    },
    {
      key: 'created_at',
      label: '注册 / 最近登录',
      render: (row) => (
        <div className="text-xs">
          <p className="text-white/70">{formatDate(row.created_at)}</p>
          <p className="text-white/40 text-[11px] mt-0.5">
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
          className="rounded-lg border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-cyan-200 transition hover:bg-cyan-300/10 hover:text-cyan-100"
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
        <a
          href="/api/admin/export/users"
          download
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 transition"
        >
          ⬇ 导出用户 CSV
        </a>
      </PageHeader>

      {/* 搜索与多维筛选工具栏 */}
      <Card className="mb-6">
        <form className="flex flex-wrap items-center gap-3">
          <input
            name="q"
            defaultValue={params.get('q') || ''}
            placeholder="搜索手机号、邮箱、昵称或用户 ID…"
            className="min-w-[240px] flex-1 rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-xs text-white outline-none focus:border-cyan-300/50"
          />

          {/* 登录渠道筛选 */}
          <select
            name="provider"
            defaultValue={params.get('provider') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
          >
            <option value="">全部登录方式</option>
            <option value="phone">📱 手机短信</option>
            <option value="email">✉️ 邮箱密码</option>
            <option value="google">🔵 Google</option>
            <option value="tiktok">🎵 TikTok</option>
            <option value="x">𝕏 X (Twitter)</option>
          </select>

          {/* 运营标签筛选 */}
          <select
            name="tag"
            defaultValue={params.get('tag') || ''}
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
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
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
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
            className="rounded-xl border border-white/10 bg-[#0a0a0a] px-3 py-2.5 text-xs text-white/70 outline-none focus:border-cyan-300/50"
          >
            <option value="">全部状态</option>
            <option value="active">正常</option>
            <option value="suspended">已封禁</option>
          </select>

          <button
            type="submit"
            className="rounded-xl bg-cyan-300 px-5 py-2.5 text-xs font-bold text-black transition hover:bg-cyan-200"
          >
            筛选
          </button>

          {Array.from(params.keys()).length > 0 && (
            <Link
              href="/admin/users"
              className="rounded-xl border border-white/10 px-3 py-2.5 text-xs text-white/50 hover:bg-white/5 hover:text-white"
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
