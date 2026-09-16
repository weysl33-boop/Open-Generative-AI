import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getUserDetailFull } from '@/lib/services/users';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, DataTable, PageHeader, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import UserDetailTabs from './UserDetailTabs';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function UserDetailPage({ params }) {
  const { id } = await params;
  const detail = await getUserDetailFull(id);

  if (!detail) {
    notFound();
  }

  const { user } = detail;
  const titleDisplay = user.display_name || user.email || (user.phone ? `${user.phone_country_code || '+86'} ${user.phone}` : user.id);

  return (
    <>
      <PageHeader
        eyebrow="用户全景画像"
        title={titleDisplay}
        description={`用户 ID: ${user.id} · 注册渠道: ${user.registration_source || 'web'} · 注册于 ${formatDate(user.created_at)}`}
      >
        <Link
          href="/admin/users"
          className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
        >
          ← 返回用户列表
        </Link>
      </PageHeader>

      {/* 顶部身份卡片 */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Card>
          <p className="text-xs text-white/40">账户状态</p>
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
          <p className="text-xs text-white/40">可用模型额度</p>
          <p className="mt-2 text-3xl font-extrabold text-cyan-200">{user.credits}</p>
          <p className="mt-1 text-[11px] text-white/35">可直接用于 AI 图像/视频生成</p>
        </Card>

        <Card>
          <p className="text-xs text-white/40">活跃会话数</p>
          <p className="mt-2 text-2xl font-bold text-white">{detail.sessions.length}</p>
          <p className="mt-1 text-[11px] text-white/35">未过期的合法 HttpOnly 凭据</p>
        </Card>

        <Card>
          <p className="text-xs text-white/40">生成记录总计</p>
          <p className="mt-2 text-2xl font-bold text-white">{detail.creations.length}</p>
          <p className="mt-1 text-[11px] text-white/35">涵盖所有 Studio 模块</p>
        </Card>
      </div>

      {/* 标签页主体 */}
      <UserDetailTabs detail={detail} />
    </>
  );
}
