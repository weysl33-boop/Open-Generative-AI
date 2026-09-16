import { findUserById, getPlan, upsertSubscription, updateOrder } from '../billing.js';

export function dispatchStripeEvent(event) {
  if (!event || !event.type) {
    return { success: false, error: '事件对象为空' };
  }

  const object = event.data?.object || {};

  if (event.type === 'checkout.session.completed') {
    const userId = object.metadata?.user_id;
    const plan = getPlan(object.metadata?.plan_id);
    if (userId && findUserById(userId) && plan) {
      upsertSubscription({
        userId,
        provider: 'stripe',
        providerCustomerId: object.customer || null,
        providerSubscriptionId: object.subscription || object.id,
        planId: plan.id,
        status: 'active',
        currentPeriodEnd: null,
      });
      if (object.metadata?.order_id) {
        updateOrder(object.metadata.order_id, {
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
    if (userId && findUserById(userId) && plan) {
      const end = object.current_period_end
        ? new Date(object.current_period_end * 1000).toISOString()
        : null;
      upsertSubscription({
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
