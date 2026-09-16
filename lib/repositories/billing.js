import { query, queryOne, execute, nowIso } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function listSubscriptions(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let paramIndex = 0;
  const nextParam = () => `$${++paramIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.email ILIKE ${nextParam()} OR s.user_id ILIKE ${nextParam()} OR s.id ILIKE ${nextParam()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }

  const status = String(params.get('status') || '').trim();
  if (status) {
    clauses.push(`s.status = ${nextParam()}`);
    sqlParams.push(status);
  }

  const provider = String(params.get('provider') || '').trim();
  if (provider) {
    clauses.push(`s.provider = ${nextParam()}`);
    sqlParams.push(provider);
  }

  const baseSql = `
    SELECT s.id, s.user_id, s.provider, s.plan_id, s.status, s.current_period_end, s.cancel_at_period_end, s.created_at, s.updated_at, u.email
    FROM subscriptions s
    JOIN users u ON u.id = s.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 's',
  });
}

export async function listOrders(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let paramIndex = 0;
  const nextOrderParam = () => `$${++paramIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.email ILIKE ${nextOrderParam()} OR o.user_id ILIKE ${nextOrderParam()} OR o.id ILIKE ${nextOrderParam()} OR o.provider_order_id ILIKE ${nextOrderParam()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const status = String(params.get('status') || '').trim();
  if (status) {
    clauses.push(`o.status = ${nextOrderParam()}`);
    sqlParams.push(status);
  }

  const provider = String(params.get('provider') || '').trim();
  if (provider) {
    clauses.push(`o.provider = ${nextOrderParam()}`);
    sqlParams.push(provider);
  }

  const baseSql = `
    SELECT o.id, o.user_id, o.provider, o.plan_id, o.status, o.amount_minor, o.currency, o.provider_order_id, o.failure_code, o.paid_at, o.refunded_at, o.created_at, o.updated_at, u.email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'o',
  });
}

export async function findOrderById(orderId) {
  return await queryOne(`
    SELECT o.*, u.email
    FROM orders o
    JOIN users u ON u.id = o.user_id
    WHERE o.id = $1
  `, [orderId]);
}

export async function markOrderRefunded(orderId, reason = '') {
  const now = nowIso();
  await execute(`
    UPDATE orders
    SET status = 'refunded', refunded_at = $1, updated_at = $2
    WHERE id = $3
  `, [now, now, orderId]);
  return await findOrderById(orderId);
}

export async function listWebhookEvents(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let webhookParamIndex = 0;
  const nextWebhookParam = () => `$${++webhookParamIndex}`;

  const provider = String(params.get('provider') || '').trim();
  if (provider) {
    clauses.push(`provider = ${nextWebhookParam()}`);
    sqlParams.push(provider);
  }

  const status = String(params.get('status') || '').trim();
  if (status) {
    clauses.push(`status = ${nextWebhookParam()}`);
    sqlParams.push(status);
  }

  const baseSql = `
    SELECT provider, event_id, status, attempts, last_error, processed_at, created_at
    FROM webhook_events
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    order: 'created_at DESC, event_id DESC',
  });
}
