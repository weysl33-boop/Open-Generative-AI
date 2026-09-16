export const ROLE_LABELS = {
  super_admin: '超级管理员',
  operations_admin: '运营管理员',
  finance_admin: '财务管理员',
  support_admin: '支持管理员',
  auditor: '审计只读',
  user: '普通用户',
};

export const PERMISSIONS = {
  dashboardRead: 'dashboard.read',
  usersRead: 'users.read',
  usersUpdate: 'users.update',
  usersDelete: 'users.delete',
  sessionsRevoke: 'sessions.revoke',
  creditsRead: 'credits.read',
  creditsAdjust: 'credits.adjust',
  billingRead: 'billing.read',
  billingWrite: 'billing.write',
  plansRead: 'plans.read',
  plansWrite: 'plans.write',
  generationsRead: 'generations.read',
  generationsWrite: 'generations.write',
  moderationRead: 'moderation.read',
  moderationWrite: 'moderation.write',
  providersRead: 'providers.read',
  providersWrite: 'providers.write',
  webhooksRead: 'webhooks.read',
  webhooksReplay: 'webhooks.replay',
  healthRead: 'health.read',
  settingsRead: 'settings.read',
  settingsWrite: 'settings.write',
  auditRead: 'audit.read',
  adminsWrite: 'admins.write',
};

const ALL_PERMISSIONS = new Set(Object.values(PERMISSIONS));

export const ROLE_PERMISSIONS = {
  super_admin: ALL_PERMISSIONS,
  operations_admin: new Set([
    PERMISSIONS.dashboardRead,
    PERMISSIONS.usersRead,
    PERMISSIONS.usersUpdate,
    PERMISSIONS.sessionsRevoke,
    PERMISSIONS.generationsRead,
    PERMISSIONS.generationsWrite,
    PERMISSIONS.moderationRead,
    PERMISSIONS.moderationWrite,
    PERMISSIONS.providersRead,
    PERMISSIONS.webhooksRead,
    PERMISSIONS.healthRead,
    PERMISSIONS.auditRead,
  ]),
  finance_admin: new Set([
    PERMISSIONS.dashboardRead,
    PERMISSIONS.usersRead,
    PERMISSIONS.creditsRead,
    PERMISSIONS.creditsAdjust,
    PERMISSIONS.billingRead,
    PERMISSIONS.billingWrite,
    PERMISSIONS.plansRead,
    PERMISSIONS.plansWrite,
    PERMISSIONS.webhooksRead,
    PERMISSIONS.webhooksReplay,
    PERMISSIONS.providersRead,
    PERMISSIONS.auditRead,
  ]),
  support_admin: new Set([
    PERMISSIONS.dashboardRead,
    PERMISSIONS.usersRead,
    PERMISSIONS.sessionsRevoke,
    PERMISSIONS.creditsRead,
    PERMISSIONS.creditsAdjust, // 受限调额
    PERMISSIONS.generationsRead,
    PERMISSIONS.auditRead,
  ]),
  auditor: new Set([
    PERMISSIONS.dashboardRead,
    PERMISSIONS.usersRead,
    PERMISSIONS.creditsRead,
    PERMISSIONS.billingRead,
    PERMISSIONS.plansRead,
    PERMISSIONS.generationsRead,
    PERMISSIONS.moderationRead,
    PERMISSIONS.providersRead,
    PERMISSIONS.webhooksRead,
    PERMISSIONS.healthRead,
    PERMISSIONS.settingsRead,
    PERMISSIONS.auditRead,
  ]),
  user: new Set(),
};

export function hasPermission(role, permission) {
  if (!role || !permission) return false;
  return Boolean(ROLE_PERMISSIONS[role]?.has(permission));
}

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || '未知角色';
}
