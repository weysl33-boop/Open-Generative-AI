import 'server-only';

// 统一导出管理端核心能力，保持兼容
export * from './admin/permissions';
export * from './admin/authz';
export * from './admin/redaction';
export * from './admin/idempotency';
export * from './admin/pagination';
export * from './admin/audit';

export * as usersService from './services/users';
export * as creditsService from './services/credits';
export * as billingService from './services/billing';
export * as generationsService from './services/generations';
export * as moderationService from './services/moderation';
export * as providersService from './services/providers';
export * as settingsService from './services/settings';
export * as dashboardService from './services/dashboard';

export { getDashboardOverview as dashboard } from './services/dashboard';
export { getUserDetailFull as getUserDetail } from './services/users';
export { listUsers } from './repositories/users';
export { listActiveSessions as listSessions } from './repositories/sessions';
export { listSubscriptions, listOrders } from './repositories/billing';
export { listCreations } from './repositories/creations';
export { listCreditLedger } from './repositories/credits';
export { getAllSettings as listSettings, updateSettingValue as updateSetting } from './repositories/settings';
export { getProvidersOverview as providerStatus } from './services/providers';
