import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function listSubscriptions(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let paramIndex = 0;
  const nextParam = () => `$${++paramIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.id ILIKE ${nextParam()} OR u.email ILIKE ${nextParam()} OR s.user_id ILIKE ${nextParam()} OR s.id ILIKE ${nextParam()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
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
    SELECT s.id, s.user_id, s.provider, s.plan_id, s.status, s.current_period_end, s.cancel_at_period_end, s.created_at, s.updated_at,
           u.email, u.avatar_url
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
    clauses.push(`(u.id ILIKE ${nextOrderParam()} OR u.email ILIKE ${nextOrderParam()} OR o.user_id ILIKE ${nextOrderParam()} OR o.id ILIKE ${nextOrderParam()} OR o.provider_order_id ILIKE ${nextOrderParam()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
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
    SELECT o.id, o.user_id, o.provider, o.plan_id, o.status, o.amount_minor, o.currency, o.provider_order_id, o.failure_code, o.paid_at, o.refunded_at, o.created_at, o.updated_at,
           u.email, u.avatar_url
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

export async function listUserOrders(userId, limit = 20) {
  return queryMany(`
    SELECT id, provider, plan_id, status, amount_minor, currency, provider_order_id, created_at, updated_at
    FROM orders WHERE user_id = $1
    ORDER BY created_at DESC LIMIT $2
  `, [userId, limit]);
}

/**
 * 扫码渠道（微信/支付宝）里等不到到账通知的订单。窗口两端都封：
 * 太新的订单可能用户还在扫码，太老的订单渠道侧早已关单，继续查单只会白跑配额。
 */
export async function listOrdersAwaitingPaymentSync({ limit = 5, dueBefore, sinceAfter }) {
  return queryMany(`
    SELECT id, provider, user_id, plan_id, status, amount_minor, currency, created_at
    FROM orders
    WHERE status = 'pending'
      AND provider IN ('wechat', 'alipay')
      AND created_at <= $2
      AND created_at >= $3
    ORDER BY created_at
    LIMIT $1
  `, [Math.min(20, Math.max(1, Number(limit) || 5)), dueBefore, sinceAfter]);
}

export async function getActiveSubscription(userId) {
  return queryOne(`
    SELECT id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, created_at, updated_at
    FROM subscriptions WHERE user_id = $1 AND status IN ('active','trialing','past_due')
    ORDER BY updated_at DESC LIMIT 1
  `, [userId]);
}

export async function createPaymentOrder({ userId, provider, planId, productId = planId, productType = 'subscription', amountMinor, currency, idempotencyKey, billingCycle = 'monthly', creditAmount }) {
  const id = randomId('order');
  const now = nowIso();
  const metadata = JSON.stringify({ planId, productId, productType, billingCycle, creditAmount });
  const inserted = await queryOne(`
    INSERT INTO orders (id, user_id, provider, plan_id, status, amount_minor, currency, idempotency_key, billing_cycle, metadata_json, version, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'pending', $5, $6, $7, $8, $9::jsonb, 1, $10, $10)
    ON CONFLICT (provider, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING *
  `, [id, userId, provider, planId, amountMinor, currency, idempotencyKey, billingCycle, metadata, now]);
  if (inserted) return { order: inserted, idempotent: false };
  const existing = await queryOne('SELECT * FROM orders WHERE provider = $1 AND idempotency_key = $2', [provider, idempotencyKey]);
  if (!existing) throw new Error('支付订单幂等记录无法读取');
  const existingMetadata = typeof existing.metadata_json === 'string'
    ? (() => { try { return JSON.parse(existing.metadata_json); } catch { return {}; } })()
    : (existing.metadata_json || {});
  const existingCreditAmount = existingMetadata.creditAmount ?? existingMetadata.credit_amount;
  const existingProductType = existingMetadata.productType ?? existingMetadata.product_type ?? 'subscription';
  const existingProductId = existingMetadata.productId ?? existingMetadata.product_id ?? existing.plan_id;
  if (existing.user_id !== userId || existing.plan_id !== planId
    || Number(existing.amount_minor) !== Number(amountMinor) || existing.currency !== currency
    || (existing.billing_cycle && existing.billing_cycle !== billingCycle)
    || existingProductType !== productType || existingProductId !== productId
    || (existingCreditAmount !== undefined && Number(existingCreditAmount) !== Number(creditAmount))) {
    throw Object.assign(new Error('幂等键已经用于另一笔支付订单'), { code: 'IDEMPOTENCY_CONFLICT' });
  }
  return { order: existing, idempotent: true };
}

export async function updateOrderFields(orderId, updates = {}) {
  const allowed = ['status', 'provider_order_id', 'checkout_url', 'failure_code', 'paid_at', 'refunded_at'];
  const entries = Object.entries(updates).filter(([key, value]) => allowed.includes(key) && value !== undefined);
  if (!entries.length) return queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
  const values = [orderId];
  const set = entries.map(([key, value], index) => { values.push(value); return `${key} = $${index + 2}`; });
  values.push(nowIso());
  await execute(`UPDATE orders SET ${set.join(', ')}, updated_at = $${values.length} WHERE id = $1`, values);
  return queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
}

export async function lockOrder(orderId, transaction) {
  return transaction.queryOne('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
}

export async function markOrderRefundedInTransaction(orderId, timestamp, transaction) {
  return transaction.queryOne("UPDATE orders SET status = 'refunded', refunded_at = $1, updated_at = $1, version = version + 1 WHERE id = $2 RETURNING *", [timestamp, orderId]);
}

export async function insertPaymentRefundLedger({ order, provider, eventId, externalRefundId, reason, transaction }) {
  return transaction.queryOne(`
    INSERT INTO payment_ledger
      (id, provider, event_id, order_id, user_id, entry_type, amount_minor, currency, provider_payment_id, idempotency_key, payload_json)
    VALUES ($1, $2, $3, $4, $5, 'payment_refund', $6, $7, $8, $9, $10::jsonb)
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  `, [randomId('pay'), provider, eventId, order.id, order.user_id, Number(order.amount_minor || 0), order.currency, order.provider_payment_id || order.provider_order_id, `refund:${order.id}`, JSON.stringify({ externalRefundId, reason: reason || null })]);
}

export async function cancelMatchingSubscription({ userId, planId, timestamp, transaction }) {
  return transaction.execute("UPDATE subscriptions SET status = 'canceled', updated_at = $1, version = version + 1 WHERE user_id = $2 AND plan_id = $3 AND status IN ('active', 'trialing')", [timestamp, userId, planId]);
}

export async function markOrderRefunded(orderId, reason = '') {
  const now = nowIso();
  const updated = await queryOne(`
    UPDATE orders
    SET status = 'refunded', refunded_at = $1, updated_at = $2
    WHERE id = $3 AND status IN ('paid', 'completed')
    RETURNING id
  `, [now, now, orderId]);
  if (!updated) return null;
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
