'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';

const NAV_GROUPS = [
  {
    label: '工作台',
    items: [
      { href: '/admin', label: '运营概览', permission: PERMISSIONS.dashboardRead, exact: true },
    ],
  },
  {
    label: '用户与权限',
    items: [
      { href: '/admin/users', label: '用户管理', permission: PERMISSIONS.usersRead },
      { href: '/admin/admins', label: '管理员与角色', permission: PERMISSIONS.adminsWrite },
      { href: '/admin/security/sessions', label: '会话与安全', permission: PERMISSIONS.sessionsRevoke },
    ],
  },
  {
    label: '计费与权益',
    items: [
      { href: '/admin/subscriptions', label: '订阅管理', permission: PERMISSIONS.billingRead },
      { href: '/admin/orders', label: '订单与支付', permission: PERMISSIONS.billingRead },
      { href: '/admin/credits', label: '额度账本', permission: PERMISSIONS.creditsRead },
      { href: '/admin/coupons', label: '卡密与兑换码', permission: PERMISSIONS.creditsRead },
      { href: '/admin/plans', label: '套餐配置', permission: PERMISSIONS.plansRead },
    ],
  },
  {
    label: '内容与任务',
    items: [
      { href: '/admin/generations', label: '生成任务', permission: PERMISSIONS.generationsRead, exact: true },
      { href: '/admin/generations/failures', label: '失败任务排查', permission: PERMISSIONS.generationsRead },
      { href: '/admin/moderation', label: '内容审核', permission: PERMISSIONS.moderationRead },
    ],
  },
  {
    label: '模型与集成',
    items: [
      { href: '/admin/models', label: '模型开关与成本', permission: PERMISSIONS.providersRead },
      { href: '/admin/providers/ai', label: 'AI 供应商状态', permission: PERMISSIONS.providersRead },
      { href: '/admin/providers/payments', label: '支付渠道', permission: PERMISSIONS.providersRead },
      { href: '/admin/webhooks', label: 'Webhook 事件', permission: PERMISSIONS.webhooksRead },
    ],
  },
  {
    label: '系统',
    items: [
      { href: '/admin/health', label: '系统健康', permission: PERMISSIONS.healthRead },
      { href: '/admin/settings', label: '系统设置与前端', permission: PERMISSIONS.settingsRead },
      { href: '/admin/audit', label: '审计日志', permission: PERMISSIONS.auditRead },
    ],
  },
];

export default function AdminNav({ user, onItemClick }) {
  const pathname = usePathname();
  const role = user?.role || 'user';

  return (
    <nav aria-label="管理后台导航" className="space-y-6">
      {NAV_GROUPS.map((group) => {
        // 根据角色权限裁剪过滤菜单项
        const visibleItems = group.items.filter((item) =>
          hasPermission(role, item.permission)
        );

        if (!visibleItems.length) return null;

        return (
          <div key={group.label}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.22em] text-white/30">
              {group.label}
            </p>
            <div className="space-y-1">
              {visibleItems.map((item) => {
                const active = item.exact
                  ? pathname === item.href
                  : pathname === item.href || (pathname.startsWith(`${item.href}/`) && !item.exact);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={onItemClick}
                    className={`group relative flex h-11 items-center rounded-xl px-3 text-[13px] font-medium transition-all ${
                      active
                        ? 'bg-cyan-300/10 text-cyan-200 shadow-sm shadow-cyan-300/10'
                        : 'text-white/60 hover:bg-white/[0.05] hover:text-white'
                    }`}
                  >
                    <span
                      className={`mr-3 h-2 w-2 rounded-full transition-transform ${
                        active
                          ? 'bg-[#22d3ee] shadow-[0_0_8px_rgba(34,211,238,0.8)] scale-110'
                          : 'bg-white/20 group-hover:bg-white/40'
                      }`}
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
