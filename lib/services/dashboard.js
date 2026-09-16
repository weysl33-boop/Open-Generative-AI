import { query, queryOne } from '../db/index.js';
import { getLatestHealthChecks } from '../repositories/providers.js';

export async function getDashboardOverview() {
  const countOf = async (sqlText) => {
    try {
      const row = await queryOne(sqlText);
      return Number(row?.n || 0);
    } catch {
      return 0;
    }
  };

  const users = await countOf('SELECT COUNT(*) AS n FROM users');
  const todayNewUsers = await countOf('SELECT COUNT(*) AS n FROM users WHERE created_at >= CURRENT_DATE');
  const activeSessions = await countOf("SELECT COUNT(*) AS n FROM sessions WHERE expires_at > NOW() AND revoked_at IS NULL");
  const subscriptions = await countOf("SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active', 'trialing')");
  const creations = await countOf('SELECT COUNT(*) AS n FROM creations');
  const failedCreations = await countOf("SELECT COUNT(*) AS n FROM creations WHERE status NOT IN ('completed', 'success')");
  const orders = await countOf("SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending', 'paid', 'completed')");
  const paidOrdersCount = await countOf("SELECT COUNT(*) AS n FROM orders WHERE status IN ('paid', 'completed')");
  const pendingModerations = await countOf("SELECT COUNT(*) AS n FROM moderation_cases WHERE status = 'pending'");

  // 收入与财务统计（区分 USD 与 CNY）
  let incomeUsd = 0;
  let incomeCny = 0;
  try {
    const usdRow = await queryOne("SELECT COALESCE(SUM(amount_minor), 0) AS total FROM orders WHERE status IN ('paid', 'completed') AND UPPER(currency) = 'USD'");
    const cnyRow = await queryOne("SELECT COALESCE(SUM(amount_minor), 0) AS total FROM orders WHERE status IN ('paid', 'completed') AND UPPER(currency) = 'CNY'");
    incomeUsd = Number(usdRow?.total || 0) / 100;
    incomeCny = Number(cnyRow?.total || 0) / 100;
  } catch {}

  // 综合换算等值 USD (按 1 USD = 7.2 CNY 估算)
  const totalRevenueUsd = incomeUsd + (incomeCny / 7.2);

  // 上游真实 API 成本统计
  let totalApiCostUsd = 0;
  try {
    const costRow = await queryOne("SELECT COALESCE(SUM(actual_cost_usd), 0) AS total FROM creations");
    totalApiCostUsd = Number(costRow?.total || 0);
  } catch {}

  // 综合毛利与毛利率
  const grossProfitUsd = totalRevenueUsd - totalApiCostUsd;
  const grossMarginPct = totalRevenueUsd > 0
    ? Math.max(0, Math.min(100, Math.round((grossProfitUsd / totalRevenueUsd) * 100)))
    : (totalApiCostUsd === 0 ? 100 : 0);

  // 近 7 天生成调用走势 (每日统计)
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dateStr = d.toISOString().slice(0, 10);
    const dayLabel = `${d.getMonth() + 1}/${d.getDate()}`;
    let dayCount = 0;
    try {
      const row = await queryOne(
        "SELECT COUNT(*) AS n FROM creations WHERE created_at >= $1::date AND created_at < ($2::date + INTERVAL '1 day')",
        [dateStr, dateStr]
      );
      dayCount = Number(row?.n || 0);
    } catch {}
    last7Days.push({ date: dateStr, label: dayLabel, count: dayCount });
  }

  // 最近 8 条管理员审计
  let recentAudit = [];
  try {
    const auditRes = await query(`
      SELECT id, action, target_type, target_id, before_json, after_json, created_at
      FROM admin_audit_logs
      ORDER BY created_at DESC
      LIMIT 8
    `);
    recentAudit = auditRes.rows;
  } catch {}

  // 待处理风险队列
  const risks = [];
  if (failedCreations > 0) {
    risks.push({
      id: 'failed_creations',
      title: '失败生成任务',
      count: failedCreations,
      severity: 'warn',
      link: '/admin/generations',
    });
  }
  if (pendingModerations > 0) {
    risks.push({
      id: 'pending_moderation',
      title: '待审核违规内容',
      count: pendingModerations,
      severity: 'danger',
      link: '/admin/moderation',
    });
  }

  // 供应商健康摘要
  let latestChecks = [];
  try {
    latestChecks = await getLatestHealthChecks();
  } catch {}

  return {
    metrics: {
      users,
      todayNewUsers,
      activeSessions,
      subscriptions,
      creations,
      failedCreations,
      orders,
      paidOrdersCount,
      pendingModerations,
      incomeUsd,
      incomeCny,
      totalRevenueUsd,
      totalApiCostUsd,
      grossProfitUsd,
      grossMarginPct,
    },
    trend: last7Days,
    recentAudit,
    risks,
    health: latestChecks,
  };
}
