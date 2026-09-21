import { nowIso, queryMany, queryOne, randomId } from '../db/index.js';

export async function findUserInTransaction(userId, transaction) {
  return transaction.queryOne('SELECT id FROM users WHERE id = $1', [userId]);
}

export async function lockOrderInTransaction(orderId, transaction) {
  return transaction.queryOne('SELECT * FROM orders WHERE id = $1 FOR UPDATE', [orderId]);
}

export async function mergeOrderMetadataInTransaction(orderId, metadata, transaction) {
  return transaction.queryOne(`
    UPDATE orders
    SET metadata_json = COALESCE(metadata_json, '{}'::jsonb) || $1::jsonb,
        updated_at = $2, version = version + 1
    WHERE id = $3
    RETURNING *
  `, [JSON.stringify(metadata || {}), nowIso(), orderId]);
}

export async function createStripeRenewalOrderInTransaction({
  invoiceId,
  stripeSubscriptionId,
  baseOrder,
  amountMinor,
  currency,
  creditAmount,
  providerPaymentId,
  transaction,
}) {
  const now = nowIso();
  const idempotencyKey = `stripe-renewal:${invoiceId}`;
  const metadata = JSON.stringify({
    planId: baseOrder.plan_id,
    billingCycle: 'monthly',
    creditAmount,
    stripeSubscriptionId,
    invoiceId,
    baseOrderId: baseOrder.id,
  });
  const inserted = await transaction.queryOne(`
    INSERT INTO orders
      (id, user_id, provider, plan_id, status, amount_minor, currency, provider_order_id,
       provider_payment_id, idempotency_key, billing_cycle, metadata_json, version, created_at, updated_at)
    VALUES ($1, $2, 'stripe', $3, 'pending', $4, $5, $6, $7, $8, 'monthly', $9::jsonb, 1, $10, $10)
    ON CONFLICT (provider, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING *
  `, [randomId('order'), baseOrder.user_id, baseOrder.plan_id, amountMinor, currency, invoiceId, providerPaymentId, idempotencyKey, metadata, now]);
  if (inserted) return { order: inserted, idempotent: false };

  const existing = await transaction.queryOne(
    'SELECT * FROM orders WHERE provider = $1 AND idempotency_key = $2 FOR UPDATE',
    ['stripe', idempotencyKey],
  );
  if (!existing || existing.user_id !== baseOrder.user_id || existing.plan_id !== baseOrder.plan_id
    || Number(existing.amount_minor) !== Number(amountMinor) || String(existing.currency).toUpperCase() !== String(currency).toUpperCase()) {
    throw Object.assign(new Error('Stripe 续期发票幂等记录与订单不一致'), { code: 'STRIPE_RENEWAL_ORDER_CONFLICT' });
  }
  return { order: existing, idempotent: true };
}

export async function lockOrderByProviderPaymentInTransaction(paymentId, transaction) {
  return transaction.queryOne('SELECT * FROM orders WHERE provider_payment_id = $1 OR provider_order_id = $1 FOR UPDATE', [paymentId]);
}

export async function recordPaymentSuccess({ provider = 'stripe', eventId, order, userId, amountMinor, currency, providerPaymentId, payload, transaction }) {
  return transaction.queryOne(`
    INSERT INTO payment_ledger
      (id, provider, event_id, order_id, user_id, entry_type, amount_minor, currency, provider_payment_id, idempotency_key, payload_json)
    VALUES ($1, $2, $3, $4, $5, 'payment_succeeded', $6, $7, $8, $9, $10::jsonb)
    ON CONFLICT DO NOTHING RETURNING id
  `, [randomId('pay'), provider, eventId, order.id, userId, amountMinor, currency, providerPaymentId, `${provider}:${eventId}:payment_succeeded`, JSON.stringify(payload || {})]);
}

export async function markOrderPaid({ orderId, providerOrderId, providerPaymentId, providerCustomerId, paidAmountMinor, payload, timestamp, transaction }) {
  return transaction.queryOne(`
    UPDATE orders
    SET status = CASE WHEN status = 'refunded' THEN status ELSE 'paid' END,
        provider_order_id = COALESCE(provider_order_id, $1), provider_payment_id = COALESCE($2, provider_payment_id),
        provider_customer_id = COALESCE($3, provider_customer_id), paid_amount_minor = COALESCE($4, paid_amount_minor),
        provider_payload_json = $5::jsonb, paid_at = COALESCE(paid_at, $6), updated_at = $6, version = version + 1
    WHERE id = $7
    RETURNING id, status
  `, [providerOrderId, providerPaymentId, providerCustomerId, paidAmountMinor, JSON.stringify(payload || {}), timestamp, orderId]);
}

export async function markOrderPaymentFailed({ orderId, providerPaymentId, failureCode, timestamp, transaction }) {
  return transaction.execute("UPDATE orders SET status = 'failed', failure_code = $1, provider_payment_id = COALESCE($2, provider_payment_id), updated_at = $3, version = version + 1 WHERE id = $4", [failureCode, providerPaymentId, timestamp, orderId]);
}

export async function recordPaymentRefund({ provider = 'stripe', eventId, order, paymentIntentId, amountMinor, currency, payload, transaction }) {
  return transaction.queryOne(`
    INSERT INTO payment_ledger
      (id, provider, event_id, order_id, user_id, entry_type, amount_minor, currency, provider_payment_id, idempotency_key, payload_json)
    VALUES ($1, $2, $3, $4, $5, 'payment_refund', $6, $7, $8, $9, $10::jsonb)
    ON CONFLICT (provider, event_id, entry_type) DO NOTHING RETURNING id
  `, [randomId('pay'), provider, eventId, order.id, order.user_id, amountMinor, currency, paymentIntentId, `${provider}:${eventId}:payment_refund`, JSON.stringify(payload || {})]);
}

export async function markOrderRefundedFromWebhook(orderId, timestamp, transaction) {
  return transaction.execute("UPDATE orders SET status = 'refunded', refunded_at = COALESCE(refunded_at, $1), updated_at = $1, version = version + 1 WHERE id = $2 AND status <> 'refunded'", [timestamp, orderId]);
}

export async function syncStripeSubscription({ userId, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, eventCreatedAt, transaction }) {
  const now = nowIso();
  return transaction.queryOne(`
    INSERT INTO subscriptions
      (id, user_id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, last_synced_at, last_provider_event_created_at, version, created_at, updated_at)
    VALUES ($1, $2, 'stripe', $3, $4, $5, $6, $7, $8, $9, 1, $8, $8)
    ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET
      user_id = EXCLUDED.user_id, provider_customer_id = EXCLUDED.provider_customer_id,
      plan_id = EXCLUDED.plan_id, status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end,
      last_synced_at = EXCLUDED.last_synced_at, last_provider_event_created_at = EXCLUDED.last_provider_event_created_at,
      version = subscriptions.version + 1, updated_at = EXCLUDED.updated_at
    WHERE subscriptions.last_provider_event_created_at IS NULL
       OR (EXCLUDED.last_provider_event_created_at IS NOT NULL
           AND EXCLUDED.last_provider_event_created_at >= subscriptions.last_provider_event_created_at)
    RETURNING *
  `, [randomId('sub'), userId, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, now, eventCreatedAt]);
}

export async function syncPaymentSubscription({ userId, provider, providerCustomerId, providerSubscriptionId, planId, status = 'active', currentPeriodEnd, eventCreatedAt, transaction }) {
  const now = nowIso();
  const existing = await transaction.queryOne(
    'SELECT id FROM subscriptions WHERE user_id = $1 AND provider = $2 ORDER BY updated_at DESC LIMIT 1 FOR UPDATE',
    [userId, provider]
  );
  if (existing) {
    return transaction.queryOne(`
      UPDATE subscriptions
      SET plan_id = $1, status = $2, current_period_end = $3,
          provider_customer_id = COALESCE($4, provider_customer_id),
          provider_subscription_id = COALESCE($5, provider_subscription_id),
          last_synced_at = $6, updated_at = $6, version = version + 1
      WHERE id = $7
      RETURNING *
    `, [planId, status, currentPeriodEnd, providerCustomerId, providerSubscriptionId, now, existing.id]);
  }

  return transaction.queryOne(`
    INSERT INTO subscriptions
      (id, user_id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, last_synced_at, last_provider_event_created_at, version, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $9, $9)
    RETURNING *
  `, [randomId('sub'), userId, provider, providerCustomerId, providerSubscriptionId, planId, status, currentPeriodEnd, now, eventCreatedAt || now]);
}


export async function claimWebhookEvent({ provider = 'stripe', eventId, eventType, eventCreatedAt = null, payload, headers, timestamp, transaction }) {
  return transaction.queryOne(`
    INSERT INTO webhook_events
      (provider, event_id, event_type, event_created_at, status, attempts, payload_json, headers_json, received_at, last_attempt_at, created_at)
    VALUES ($1, $2, $3, $4, 'received', 1, $5::jsonb, $6::jsonb, $7, $7, $7)
    ON CONFLICT (provider, event_id) DO NOTHING RETURNING event_id
  `, [provider, eventId, eventType || null, eventCreatedAt, JSON.stringify(payload || {}), headers ? JSON.stringify(headers) : null, timestamp]);
}

export async function getWebhookEventForUpdate(eventId, transaction, provider = 'stripe') {
  return transaction.queryOne('SELECT status, attempts FROM webhook_events WHERE provider = $1 AND event_id = $2 FOR UPDATE', [provider, eventId]);
}

export async function markWebhookReceived(eventId, timestamp, transaction, provider = 'stripe') {
  return transaction.execute("UPDATE webhook_events SET status = 'received', attempts = attempts + 1, last_error = NULL, last_attempt_at = $1, next_retry_at = NULL WHERE provider = $2 AND event_id = $3", [timestamp, provider, eventId]);
}

export async function markWebhookFailed(eventId, errorMessage, retryAt, transaction, provider = 'stripe') {
  return transaction.execute("UPDATE webhook_events SET status = 'failed', last_error = $1, next_retry_at = $3 WHERE provider = $2 AND event_id = $4", [errorMessage, provider, retryAt, eventId]);
}

export async function markWebhookProcessed(eventId, timestamp, transaction, provider = 'stripe') {
  return transaction.execute("UPDATE webhook_events SET status = 'processed', processed_at = COALESCE(processed_at, $1), last_error = NULL, next_retry_at = NULL WHERE provider = $2 AND event_id = $3", [timestamp, provider, eventId]);
}

export async function findWebhookEvent(eventId, provider = 'stripe') {
  return queryOne('SELECT * FROM webhook_events WHERE provider = $1 AND event_id = $2', [provider, eventId]);
}

export async function markWebhookReplay({ eventId, status, replayedAt, lastError, transaction, provider = 'stripe' }) {
  return transaction.execute('UPDATE webhook_events SET status = $1, replayed_at = $2, last_error = $3 WHERE provider = $4 AND event_id = $5', [status, replayedAt, lastError, provider, eventId]);
}

/**
 * 事务回滚后的停放。回滚会把 markWebhookReceived 记下的那次 attempts 自增一起吞掉，
 * 所以这里必须补记一次：否则一条永久性失败的事件（用户不存在、报文缺订单号）会以退避
 * 节奏无限重投，maxAttempts 上限形同虚设。countAttempt=false 用于事务已提交的场景。
 */
export async function markWebhookFailedAfterRollback({
  eventId,
  errorCode,
  retryAt,
  provider = 'stripe',
  countAttempt = true,
}) {
  return queryOne(`
    UPDATE webhook_events
    SET status = 'failed', attempts = attempts + $2, last_error = $1, next_retry_at = $3
    WHERE provider = $4 AND event_id = $5
    RETURNING event_id
  `, [errorCode, countAttempt ? 1 : 0, retryAt, provider, eventId]);
}

/**
 * 到期事件只负责被发现，真正的占位由 claimWebhookRetry 的原子更新完成：
 * 并发 worker 抢同一行时输家的 UPDATE 不命中，直接跳过，不会重放两次。
 */
export async function listDueWebhookRetries({ limit = 10, timestamp, staleBefore, maxAttempts }) {
  return queryMany(`
    SELECT provider, event_id FROM webhook_events
    WHERE attempts < $2
      AND (
        (status IN ('failed', 'replay_failed') AND next_retry_at IS NOT NULL AND next_retry_at <= $3)
        OR (status = 'retrying' AND last_attempt_at IS NOT NULL AND last_attempt_at < $4)
      )
    ORDER BY COALESCE(next_retry_at, last_attempt_at)
    LIMIT $1
  `, [Math.min(50, Math.max(1, Number(limit) || 10)), maxAttempts, timestamp, staleBefore]);
}

export async function claimWebhookRetry({ provider, eventId, timestamp, staleBefore, maxAttempts }) {
  return queryOne(`
    UPDATE webhook_events
    SET status = 'retrying', next_retry_at = NULL, last_attempt_at = $2
    WHERE provider = $1 AND event_id = $3
      AND attempts < $4
      AND (
        (status IN ('failed', 'replay_failed') AND next_retry_at IS NOT NULL AND next_retry_at <= $2)
        OR (status = 'retrying' AND last_attempt_at IS NOT NULL AND last_attempt_at < $5)
      )
    RETURNING provider, event_id, event_type, status, attempts, payload_json, headers_json
  `, [provider, timestamp, eventId, maxAttempts, staleBefore]);
}
