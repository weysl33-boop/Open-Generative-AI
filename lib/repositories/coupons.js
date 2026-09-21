import { execute, nowIso, queryOne, randomId } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

function runner(transaction, method, fallback) {
  return transaction?.[method] ? transaction[method].bind(transaction) : fallback;
}

export async function createCoupon({ code, type, value, maxUses, expiresAt = null, createdBy = 'admin', timestamp = nowIso(), transaction = null }) {
  const run = runner(transaction, 'execute', execute);
  return run(`
    INSERT INTO coupons (code, type, value, max_uses, used_count, is_active, expires_at, created_by, created_at)
    VALUES ($1, $2, $3, $4, 0, TRUE, $5, $6, $7)
  `, [code, type, String(value), maxUses, expiresAt, createdBy, timestamp]);
}

export async function findCoupon(code) {
  return queryOne('SELECT * FROM coupons WHERE code = $1', [code]);
}

export async function findCouponRedemption(code, userId, transaction) {
  return transaction.queryOne('SELECT 1 FROM coupon_redemptions WHERE coupon_code = $1 AND user_id = $2', [code, userId]);
}

export async function incrementCouponUse(code, transaction) {
  return transaction.execute('UPDATE coupons SET used_count = used_count + 1 WHERE code = $1 AND is_active = TRUE AND used_count < max_uses', [code]);
}

export async function createCouponRedemption({ code, userId, value, redeemedAt = nowIso(), transaction }) {
  const id = randomId('redm');
  await transaction.execute('INSERT INTO coupon_redemptions (id, coupon_code, user_id, value, redeemed_at) VALUES ($1, $2, $3, $4, $5)', [id, code, userId, value, redeemedAt]);
  return { id };
}

export async function upsertCouponSubscription({ userId, redemptionId, planId, periodEnd, timestamp = nowIso(), transaction }) {
  return transaction.queryOne(`
    INSERT INTO subscriptions (id, user_id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, last_synced_at, version, created_at, updated_at)
    VALUES ($1, $2, 'coupon', $3, $4, $5, 'active', $6, $7, 1, $7, $7)
    ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end, updated_at = EXCLUDED.updated_at
    RETURNING id
  `, [randomId('sub'), userId, `coupon_${String(planId || '').toUpperCase()}`, redemptionId, planId, periodEnd, timestamp]);
}

export async function listCoupons(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const values = [];
  let index = 0;
  const next = () => `$${++index}`;
  const q = String(params.get('q') || '').trim();
  if (q) { clauses.push(`(code ILIKE ${next()} OR value ILIKE ${next()})`); values.push(`%${q}%`, `%${q}%`); }
  return pagedQuery({
    baseSql: `SELECT code AS id, code, type, value, max_uses, used_count, is_active, expires_at, created_by, created_at FROM coupons WHERE ${clauses.join(' AND ')}`,
    params: values,
    searchParams: params,
    order: 'created_at DESC, code DESC',
  });
}
