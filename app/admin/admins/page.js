import { listAdmins } from '@/lib/services/adminRead';
import { roleLabel } from '@/lib/admin/permissions';
import { Card, PageHeader, StatusBadge, CopyableId } from '@/components/admin/AdminUi';
import { UserSubject } from '@/components/admin/UserSubject';
import AdminRoleModifier from './AdminRoleModifier';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

function formatDate(value) {
  return value
    ? new Date(value).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false })
    : '—';
}

export default async function AdminsPage() {
  await requireAdminPagePermission(PERMISSIONS.adminsWrite);
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
          <div className="flex items-center justify-between border-b border-line pb-4 mb-4">
            <h2 className="text-sm font-semibold text-ink">当前后台管理员名单</h2>
            <StatusBadge tone="info">{admins.length} 位团队成员</StatusBadge>
          </div>

          <div className="space-y-3">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-base p-4 transition-all hover:border-line-strong"
              >
                <div>
                  <UserSubject row={admin} href={`/admin/users/${admin.id}`} />
                  <div className="mt-1 flex items-center gap-2">
                    <CopyableId id={admin.id} label="内部记录 ID" />
                    <span className="text-ink-subtle">·</span>
                    <span className="text-xs text-ink-muted">创建于 {formatDate(admin.created_at)}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
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
          <h2 className="text-sm font-semibold text-ink mb-1.5">调整管理员角色</h2>
          <p className="text-xs text-ink-muted mb-4">
            分配内置 RBAC 权限。若选择“普通用户”，将即时解除该用户的全部后台管理权限。
          </p>
          <AdminRoleModifier />
        </Card>
      </div>
    </>
  );
}
