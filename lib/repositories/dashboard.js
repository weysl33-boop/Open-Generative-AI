import { query, queryOne } from '../db/index.js';

const COUNT_QUERIES = Object.freeze({
  users: 'SELECT COUNT(*) AS n FROM users',
  'users.today': 'SELECT COUNT(*) AS n FROM users WHERE created_at >= $1 AND created_at < $2',
  sessions: "SELECT COUNT(*) AS n FROM sessions WHERE expires_at > NOW() AND revoked_at IS NULL",
  subscriptions: "SELECT COUNT(*) AS n FROM subscriptions WHERE status IN ('active', 'trialing')",
  creations: 'SELECT COUNT(*) AS n FROM creations',
  'creations.success': "SELECT COUNT(*) AS n FROM creations WHERE status = 'succeeded'",
  'creations.failures': "SELECT COUNT(*) AS n FROM creations WHERE status IN ('failed', 'cancelled')",
  orders: "SELECT COUNT(*) AS n FROM orders WHERE status IN ('pending', 'paid', 'completed')",
  'orders.paid': "SELECT COUNT(*) AS n FROM orders WHERE status IN ('paid', 'completed')",
  moderation: "SELECT COUNT(*) AS n FROM moderation_cases WHERE status = 'pending'",
});

export async function getDashboardCount(section, params = []) {
  const sql = COUNT_QUERIES[section];
  if (!sql) throw new Error(`Unknown dashboard count: ${section}`);
  return queryOne(sql, params);
}

export async function getDashboardRevenue() {
  return queryOne(`SELECT
    COALESCE(SUM(CASE WHEN UPPER(currency) = 'USD' THEN amount_minor ELSE 0 END), 0) AS usd_minor,
    COALESCE(SUM(CASE WHEN UPPER(currency) = 'CNY' THEN amount_minor ELSE 0 END), 0) AS cny_minor
    FROM orders WHERE status IN ('paid', 'completed')`);
}

export async function getDashboardCost() {
  return queryOne('SELECT COALESCE(SUM(actual_cost_usd), 0) AS total FROM creations');
}

export async function getDashboardCreationTrend(start, end) {
  return queryOne('SELECT COUNT(*) AS n FROM creations WHERE created_at >= $1 AND created_at < $2', [start, end]);
}

export async function listRecentAuditLogs(limit = 8) {
  const result = await query(`SELECT id, action, target_type, target_id, actor_email, risk_level, before_json, after_json, created_at
    FROM admin_audit_logs ORDER BY created_at DESC LIMIT $1`, [limit]);
  return result.rows;
}
