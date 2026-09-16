import { getPlan, upsertSubscription, updateOrder } from '../billing.js';
import { findUserById } from '../repositories/users.js';
import { execute, nowIso, queryOne } from '../db/index.js';
import { logAudit } from '../admin/audit.js';

export async function dispatchStripeEvent(event) {
  if (!event || !event.type) {
    return { success: false, error: '事件对象为空' };
  }

  const object = event.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const userId = object.metadata?.user_id;
    const plan = getPlan(object.metadata?.plan_id);
    if (userId && await findUserById(userId) && plan) {
      await upsertSubscription({
        userId,
        provider: 'stripe',
        providerCustomerId: object.customer || null,
        providerSubscriptionId: object.subscription || object.id,
        planId: plan.id,
        status: 'active',
        currentPeriodEnd: null,
      });
      if (object.metadata?.order_id) {
        await updateOrder(object.metadata.order_id, {
          status: 'paid',
          provider_order_id: object.id,
        });
      }
      return { success: true, action: 'order_paid_and_subscription_activated' };
    }
  } else if (
    event.type === 'customer.subscription.updated' ||
    event.type === 'customer.subscription.deleted'
  ) {
    const metadata = object.metadata || {};
    const plan = getPlan(metadata.plan_id || 'pro');
    const userId = metadata.user_id;
    if (userId && await findUserById(userId) && plan) {
      const end = object.current_period_end
        ? new Date(object.current_period_end * 1000).toISOString()
        : null;
      await upsertSubscription({
        userId,
        provider: 'stripe',
        providerCustomerId: object.customer || null,
        providerSubscriptionId: object.id,
        planId: plan.id,
        status: event.type.endsWith('.deleted') ? 'canceled' : object.status || 'active',
        currentPeriodEnd: end,
      });
      return { success: true, action: 'subscription_synced' };
    }
  }

  return { success: true, action: 'ignored_unhandled_type', type: event.type };
}

export async function replayWebhookEvent({ actor, eventId, requestId }) {
  const event = await queryOne(
    'SELECT * FROM webhook_events WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1',
    [eventId],
  );
  if (!event) return { error: 'NOT_FOUND' };

  let replayDetail = 'attempts_incremented';
  let replayError = null;
  if (event.payload_json) {
    try {
      const payload = typeof event.payload_json === 'string'
        ? JSON.parse(event.payload_json)
        : event.payload_json;
      const result = await dispatchStripeEvent(payload);
      if (result.success) replayDetail = result.action || 'dispatched';
      else replayError = result.error;
    } catch (error) {
      replayError = error.message;
    }
  }

  const nextStatus = replayError ? 'replay_failed' : 'replayed';
  await execute(`
    UPDATE webhook_events
    SET attempts = attempts + 1, status = $1, last_error = $2, processed_at = $3
    WHERE provider = $4 AND event_id = $5
  `, [nextStatus, replayError, nowIso(), event.provider, eventId]);

  await logAudit({
    actor,
    action: 'webhooks.replay',
    targetType: 'webhook_event',
    targetId: eventId,
    riskLevel: 'medium',
    before: { attempts: event.attempts, status: event.status },
    after: {
      attempts: Number(event.attempts || 0) + 1,
      status: nextStatus,
      replayDetail,
      replayError,
    },
    requestId,
  });

  return { eventId, status: nextStatus, detail: replayDetail, error: replayError };
}
