import crypto from 'node:crypto';
import { execute, nowIso, queryOne, randomId, withTransaction } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';
import { logAudit } from '../admin/audit.js';

export function generateCouponCode(prefix = 'KOYO') {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function createCouponsBatch({ count = 1, type = 'credits', value = '50', maxUses = 1, expiresAt = null, actor, requestId }) {
  const createdCoupons = [];
  const boundedCount = Math.min(100, Math.max(1, Number(count) || 1));
  const timestamp = nowIso();
  await withTransaction(async (tx) => {
    for (let i = 0; i < boundedCount; i += 1) {
      const code = generateCouponCode();
      await tx.execute(`
        INSERT INTO coupons (code, type, value, max_uses, used_count, is_active, expires_at, created_by, created_at)
        VALUES ($1, $2, $3, $4, 0, TRUE, $5, $6, $7)
      `, [code, type, String(value), Number(maxUses) || 1, expiresAt || null, actor?.email || 'admin', timestamp]);
      createdCoupons.push(code);
    }
    await logAudit({ actor, action: 'coupons.batch_create', targetType: 'coupon', targetId: createdCoupons[0], riskLevel: 'medium', after: { count: boundedCount, type, value, createdCoupons }, requestId });
  });
  return { success: true, count: boundedCount, codes: createdCoupons };
}

export async function redeemCoupon({ code, user }) {
  if (!user?.id) return { error: '请先登录后再兑换卡密' };
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return { error: '请输入卡密兑换码' };
  const coupon = await queryOne('SELECT * FROM coupons WHERE code = $1', [cleanCode]);
  if (!coupon) return { error: '兑换码不存在，请核对后重新输入' };
  if (!coupon.is_active) return { error: '该兑换码已被停用' };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) return { error: '该兑换码已过期失效' };

  return withTransaction(async (tx) => {
    const existing = await tx.queryOne('SELECT 1 FROM coupon_redemptions WHERE coupon_code = $1 AND user_id = $2', [cleanCode, user.id]);
    if (existing) return { error: '您已兑换过此兑换码，无法重复使用' };
    const changed = await tx.execute('UPDATE coupons SET used_count = used_count + 1 WHERE code = $1 AND is_active = TRUE AND used_count < max_uses', [cleanCode]);
    if (changed !== 1) return { error: '该兑换码已被完全兑换，无法再次使用' };
    const redemptionId = randomId('redm');
    await tx.execute('INSERT INTO coupon_redemptions (id, coupon_code, user_id, value, redeemed_at) VALUES ($1, $2, $3, $4, $5)', [redemptionId, cleanCode, user.id, coupon.value, nowIso()]);

    if (coupon.type === 'credits') {
      const addCredits = Math.max(1, Number(coupon.value) || 0);
      const current = await tx.queryOne('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [user.id]);
      const nextCredits = Number(current?.credits || 0) + addCredits;
      await tx.execute('UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3', [nextCredits, nowIso(), user.id]);
      await tx.execute(`INSERT INTO credit_ledger (id, user_id, delta, reason, reference_id, created_at) VALUES ($1, $2, $3, $4, $5, $6)`, [randomId('ledger'), user.id, addCredits, `兑换码充值 (${cleanCode})`, redemptionId, nowIso()]);
      return { success: true, message: `成功充值 +${addCredits} 算力额度！当前总额度: ${nextCredits}`, code: cleanCode, type: coupon.type, value: coupon.value };
    }

    if (coupon.type === 'plan') {
      const planId = coupon.value || 'pro';
      const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
      await tx.queryOne(`
        INSERT INTO subscriptions (id, user_id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, last_synced_at, version, created_at, updated_at)
        VALUES ($1, $2, 'coupon', $3, $4, $5, 'active', $6, $7, 1, $7, $7)
        ON CONFLICT (provider, provider_subscription_id) DO UPDATE SET status = EXCLUDED.status, current_period_end = EXCLUDED.current_period_end, updated_at = EXCLUDED.updated_at
        RETURNING id
      `, [randomId('sub'), user.id, `coupon_${cleanCode}`, redemptionId, planId, periodEnd, nowIso()]);
      return { success: true, message: `成功开通 [${planId.toUpperCase()}] 会员权益（有效期 30 天）！`, code: cleanCode, type: coupon.type, value: coupon.value };
    }
    return { error: '兑换码类型无效' };
  });
}

export async function listCoupons(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1']; const values = []; let index = 0; const next = () => `$${++index}`;
  const q = String(params.get('q') || '').trim();
  if (q) { clauses.push(`(code ILIKE ${next()} OR value ILIKE ${next()})`); values.push(`%${q}%`, `%${q}%`); }
  return pagedQuery({ baseSql: `SELECT code AS id, code, type, value, max_uses, used_count, is_active, expires_at, created_by, created_at FROM coupons WHERE ${clauses.join(' AND ')}`, params: values, searchParams: params, order: 'created_at DESC, code DESC' });
}
