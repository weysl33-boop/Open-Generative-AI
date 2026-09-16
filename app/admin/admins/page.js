import { listAdmins } from '@/lib/repositories/users';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, PageHeader, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import AdminRoleModifier from './AdminRoleModifier';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function AdminsPage() {
  const admins = await listAdmins();

  return (
    <>
      <PageHeader
        eyebrow="用户与权限"
        title="管理员与角色"
        description="管理平台管理团队成员与其对应的内置 RBAC 角色权限。修改管理员角色将要求二次密码核验并强制刷新该管理员的会话。"
      />

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <Card>
          <div className="flex items-center justify-between border-b border-white/[0.06] pb-4 mb-4">
            <h2 className="text-sm font-bold text-white">当前后台管理员名单</h2>
            <StatusBadge tone="info">{admins.length} 位成员</StatusBadge>
          </div>

          <div className="space-y-3">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-4"
              >
                <div>
                  <p className="text-sm font-semibold text-white">{admin.email}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <CopyableId id={admin.id} />
                    <span className="text-white/20">·</span>
                    <span className="text-[11px] text-white/40">创建于 {formatDate(admin.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <StatusBadge tone={admin.role === 'super_admin' ? 'info' : 'neutral'}>
                    {roleLabel(admin.role)}
                  </StatusBadge>
                  <StatusBadge tone={admin.status === 'suspended' ? 'danger' : 'good'}>
                    {admin.status === 'suspended' ? '已停用' : '活跃'}
                  </StatusBadge>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* 角色调整客户端面板 */}
        <Card>
          <h2 className="text-sm font-bold text-white mb-2">调整管理员角色</h2>
          <p className="text-xs text-white/40 mb-4">
            选择现有用户并分配管理角色。若选择“普通用户”，将取消该用户的全部后台管理权限。
          </p>
          <AdminRoleModifier />
        </Card>
      </div>
    </>
  );
}
