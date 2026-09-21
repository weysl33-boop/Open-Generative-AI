import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUserDetailFull } from '@/lib/services/users';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, DataTable, PageHeader, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { UserAvatar } from '@/components/admin/UserAvatar';
import UserDetailTabs from './UserDetailTabs';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function UserDetailPage({ params }) {
  await requireAdminPagePermission(PERMISSIONS.usersRead);
  const { id } = await params;
  const detail = await getUserDetailFull(id);

  if (!detail) {
    notFound();
  }

  const { user } = detail;
  const uid = user.id || null;
  const letter = (user.email || user.phone || uid || 'U').slice(0, 1).toUpperCase();
  const accountLines = [
    user.email ? `✉️ ${user.email}` : '未绑定邮箱',
    user.phone ? `📱 ${user.phone_country_code || '+86'} ${user.phone}` : null,
  ].filter(Boolean);

  return (
    <>
      <PageHeader
        eyebrow="用户全景画像"
        title={
          <span className="flex items-center gap-3">
            <span className="border-line bg-raised text-brand flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border text-body font-bold">
              <UserAvatar src={user.avatar_url} alt={uid ? `UID ${uid}` : '用户头像'} letter={letter} className="size-full object-cover" />
            </span>
            <span className="flex items-center gap-2">
              <span className="text-micro shrink-0 rounded border border-line px-1.5 py-0.5 align-middle font-semibold text-ink-subtle">
                UID
              </span>
              <CopyableId id={uid} strong />
            </span>
          </span>
        }
        description={
          <>
            <span>{accountLines.join(' · ')}</span>
            <span className="mt-0.5 block">
              注册渠道: {user.registration_source || 'web'} · 注册于 {formatDate(user.created_at)}
            </span>
          </>
        }
      >
        <Link
          href="/admin/users"
          className="rounded-xl border border-line bg-wash px-4 py-2 text-xs font-semibold text-ink-muted hover:bg-wash-press"
        >
          ← 返回用户列表
        </Link>
      </PageHeader>

      {/* 顶部身份卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <p className="text-xs text-ink-subtle">账户状态</p>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge tone={user.status === 'suspended' ? 'danger' : 'good'}>
              {user.status === 'suspended' ? '已封禁' : '正常'}
            </StatusBadge>
            <StatusBadge tone={user.role === 'user' ? 'neutral' : 'info'}>
              {roleLabel(user.role)}
            </StatusBadge>
          </div>
        </Card>

        <Card>
          <p className="text-xs text-ink-subtle">可用模型额度</p>
          <p className="mt-2 text-3xl font-extrabold text-brand-hover">{user.credits}</p>
          <p className="mt-1 text-[11px] text-ink-subtle">可直接用于 AI 图像/视频生成</p>
        </Card>

        <Card>
          <p className="text-xs text-ink-subtle">活跃会话数</p>
          <p className="mt-2 text-2xl font-bold text-ink">{detail.sessions.length}</p>
          <p className="mt-1 text-[11px] text-ink-subtle">未过期的合法 HttpOnly 凭据</p>
        </Card>

        <Card>
          <p className="text-xs text-ink-subtle">生成记录总计</p>
          <p className="mt-2 text-2xl font-bold text-ink">{detail.creations.length}</p>
          <p className="mt-1 text-[11px] text-ink-subtle">涵盖所有 Studio 模块</p>
        </Card>
      </div>

      {/* 标签页主体 */}
      <UserDetailTabs detail={detail} />
    </>
  );
}
