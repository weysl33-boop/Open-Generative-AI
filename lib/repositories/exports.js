import { queryMany } from '../db/index.js';

export function exportUsers() {
  return queryMany('SELECT id, email, display_name, role, status, credits, created_at, last_login_at FROM users ORDER BY created_at DESC');
}
export function exportOrders() {
  return queryMany('SELECT o.id, u.email, o.provider, o.plan_id, o.status, (o.amount_minor / 100.0) AS amount, o.currency, o.created_at, o.paid_at, o.refunded_at FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.created_at DESC');
}
export function exportCreations() {
  return queryMany('SELECT c.id, u.email, c.provider, c.model, c.studio_id, c.status, c.credit_cost, c.duration_ms, c.created_at, c.completed_at FROM creations c JOIN users u ON u.id = c.user_id ORDER BY c.created_at DESC LIMIT 10000');
}
