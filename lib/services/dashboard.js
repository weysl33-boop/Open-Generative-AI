import { getLatestHealthChecks } from '../repositories/providers.js';
import * as dashboardRepo from '../repositories/dashboard.js';

export const REPORT_TIMEZONE = 'Asia/Shanghai';

function dateKey(date) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: REPORT_TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function dateLabel(date) {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: REPORT_TIMEZONE, month: 'numeric', day: 'numeric' })
    .formatToParts(date).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.month}/${parts.day}`;
}

function dayBounds(date) {
  const start = new Date(`${dateKey(date)}T00:00:00+08:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86400000).toISOString() };
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function emptyDashboardSnapshot({ asOf = new Date().toISOString(), failedSections = [] } = {}) {
  const last7Days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * 86400000);
    last7Days.push({ date: dateKey(day), label: dateLabel(day), count: 0 });
  }
  return {
    meta: { contractVersion: 'p4.v1', reportTimezone: REPORT_TIMEZONE, asOf, degraded: failedSections.length > 0, failedSections },
    metrics: {
      users: 0, todayNewUsers: 0, activeSessions: 0, subscriptions: 0, creations: 0, succeededCreations: 0,
      failedCreations: 0, orders: 0, paidOrdersCount: 0, pendingModerations: 0, incomeUsd: 0, incomeCny: 0,
      totalRevenueUsd: 0, totalApiCostUsd: 0, grossProfitUsd: 0, grossMarginPct: 100,
    },
    trends: { last7Days }, recentAudit: [], risks: [], health: [],
  };
}

export function normalizeDashboardSnapshot(snapshot) {
  const base = emptyDashboardSnapshot({ asOf: snapshot?.meta?.asOf || new Date().toISOString() });
  const metrics = { ...base.metrics, ...(snapshot?.metrics || {}) };
  for (const key of Object.keys(metrics)) metrics[key] = safeNumber(metrics[key]);
  metrics.grossMarginPct = Math.max(0, Math.min(100, metrics.grossMarginPct));
  const days = Array.isArray(snapshot?.trends?.last7Days) ? snapshot.trends.last7Days.slice(-7) : [];
  while (days.length < 7) days.unshift(base.trends.last7Days[7 - days.length - 1]);
  return {
    ...base, ...snapshot,
    meta: { ...base.meta, ...(snapshot?.meta || {}), reportTimezone: REPORT_TIMEZONE },
    metrics,
    trends: { last7Days: days.map((day) => ({ date: String(day.date || ''), label: String(day.label || ''), count: Math.max(0, safeNumber(day.count)) })) },
    recentAudit: Array.isArray(snapshot?.recentAudit) ? snapshot.recentAudit : [],
    risks: Array.isArray(snapshot?.risks) ? snapshot.risks : [],
    health: Array.isArray(snapshot?.health) ? snapshot.health : [],
  };
}

export async function getDashboardOverview() {
  const failedSections = [];
  const querySafe = async (section, queryFn) => {
    try { return await queryFn(); } catch { if (!failedSections.includes(section)) failedSections.push(section); return null; }
  };
  const countOf = async (section, queryFn) => safeNumber((await querySafe(section, queryFn))?.n);
  const today = dayBounds(new Date());

  const users = await countOf('users', () => dashboardRepo.getDashboardCount('users'));
  const todayNewUsers = await countOf('users.today', () => dashboardRepo.getDashboardCount('users.today', [today.start, today.end]));
  const activeSessions = await countOf('sessions', () => dashboardRepo.getDashboardCount('sessions'));
  const subscriptions = await countOf('subscriptions', () => dashboardRepo.getDashboardCount('subscriptions'));
  const creations = await countOf('creations', () => dashboardRepo.getDashboardCount('creations'));
  const succeededCreations = await countOf('creations.success', () => dashboardRepo.getDashboardCount('creations.success'));
  const failedCreations = await countOf('creations.failures', () => dashboardRepo.getDashboardCount('creations.failures'));
  const orders = await countOf('orders', () => dashboardRepo.getDashboardCount('orders'));
  const paidOrdersCount = await countOf('orders.paid', () => dashboardRepo.getDashboardCount('orders.paid'));
  const pendingModerations = await countOf('moderation', () => dashboardRepo.getDashboardCount('moderation'));

  const revenue = await querySafe('orders.revenue', () => dashboardRepo.getDashboardRevenue());
  const incomeUsd = safeNumber(revenue?.usd_minor) / 100;
  const incomeCny = safeNumber(revenue?.cny_minor) / 100;
  const totalRevenueUsd = incomeUsd + (incomeCny / 7.2);
  const cost = await querySafe('creations.cost', () => dashboardRepo.getDashboardCost());
  const totalApiCostUsd = Math.max(0, safeNumber(cost?.total));
  const grossProfitUsd = totalRevenueUsd - totalApiCostUsd;
  const grossMarginPct = totalRevenueUsd > 0 ? Math.max(0, Math.min(100, Math.round((grossProfitUsd / totalRevenueUsd) * 100))) : (totalApiCostUsd === 0 ? 100 : 0);

  const last7Days = [];
  for (let index = 6; index >= 0; index -= 1) {
    const day = new Date(Date.now() - index * 86400000);
    const bounds = dayBounds(day);
    const row = await querySafe('creations.trend', () => dashboardRepo.getDashboardCreationTrend(bounds.start, bounds.end));
    last7Days.push({ date: dateKey(day), label: dateLabel(day), count: Math.max(0, safeNumber(row?.n)) });
  }

  let recentAudit = [];
  try {
    recentAudit = await dashboardRepo.listRecentAuditLogs(8);
  } catch { failedSections.push('audit'); }

  const risks = [];
  if (failedCreations > 0) risks.push({ id: 'failed_creations', title: '失败生成任务', count: failedCreations, severity: 'warn', link: '/admin/generations' });
  if (pendingModerations > 0) risks.push({ id: 'pending_moderation', title: '待审核违规内容', count: pendingModerations, severity: 'danger', link: '/admin/moderation' });
  let health = [];
  try { health = await getLatestHealthChecks(); } catch { failedSections.push('health'); }

  return normalizeDashboardSnapshot({
    meta: { contractVersion: 'p4.v1', reportTimezone: REPORT_TIMEZONE, asOf: new Date().toISOString(), degraded: failedSections.length > 0, failedSections },
    metrics: { users, todayNewUsers, activeSessions, subscriptions, creations, succeededCreations, failedCreations, orders, paidOrdersCount, pendingModerations, incomeUsd, incomeCny, totalRevenueUsd, totalApiCostUsd, grossProfitUsd, grossMarginPct },
    trends: { last7Days }, recentAudit, risks, health,
  });
}
