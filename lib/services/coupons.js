import crypto from 'node:crypto';
import { nowIso, withTransaction } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import { grantPerpetualCredits } from '../financial/creditService.js';
import * as couponRepo from '../repositories/coupons.js';

export function generateCouponCode(prefix = 'KOYO') {
  return `${prefix}-${crypto.randomBytes(3).toString('hex').toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

export async function createCouponsBatch({ count = 1, type = 'credits', value = '50', maxUses = 1, expiresAt = null, actor, requestId }) {
  if (!['credits', 'plan'].includes(type)) return { error: '优惠券类型无效' };
  if (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > 100) return { error: '生成数量必须是 1–100 的整数' };
  if (!Number.isInteger(Number(maxUses)) || Number(maxUses) < 1 || Number(maxUses) > 10000) return { error: '单码可用次数必须是 1–10000 的整数' };
  if (type === 'credits' && (!Number.isInteger(Number(value)) || Number(value) <= 0 || Number(value) > 1000000)) return { error: '额度券数值必须是 1–1,000,000 的整数' };
  if (type === 'plan' && !/^[a-z0-9][a-z0-9_-]{0,39}$/i.test(String(value || '').trim())) return { error: '套餐券必须填写有效的套餐 ID' };
  if (expiresAt && !Number.isFinite(new Date(expiresAt).getTime())) return { error: '优惠券过期时间格式无效' };
  const createdCoupons = [];
  const boundedCount = Math.min(100, Math.max(1, Number(count) || 1));
  const timestamp = nowIso();
  await withTransaction(async (tx) => {
    for (let i = 0; i < boundedCount; i += 1) {
      const code = generateCouponCode();
      await couponRepo.createCoupon({ code, type, value, maxUses: Number(maxUses) || 1, expiresAt: expiresAt || null, createdBy: actor?.email || 'admin', timestamp, transaction: tx });
      createdCoupons.push(code);
    }
    await logAudit({ actor, action: 'coupons.batch_create', targetType: 'coupon', targetId: createdCoupons[0], riskLevel: 'medium', after: { count: boundedCount, type, value, createdCoupons }, requestId, transaction: tx });
  });
  return { success: true, count: boundedCount, codes: createdCoupons };
}

export async function redeemCoupon({ code, user }) {
  if (!user?.id) return { error: '请先登录后再兑换卡密' };
  const cleanCode = String(code || '').trim().toUpperCase();
  if (!cleanCode) return { error: '请输入卡密兑换码' };
  const coupon = await couponRepo.findCoupon(cleanCode);
  if (!coupon) return { error: '兑换码不存在，请核对后重新输入' };
  if (!coupon.is_active) return { error: '该兑换码已被停用' };
  if (coupon.expires_at && new Date(coupon.expires_at).getTime() < Date.now()) return { error: '该兑换码已过期失效' };

  return withTransaction(async (tx) => {
    const existing = await couponRepo.findCouponRedemption(cleanCode, user.id, tx);
    if (existing) return { error: '您已兑换过此兑换码，无法重复使用' };
    const changed = await couponRepo.incrementCouponUse(cleanCode, tx);
    if (changed !== 1) return { error: '该兑换码已被完全兑换，无法再次使用' };
    const redemption = await couponRepo.createCouponRedemption({ code: cleanCode, userId: user.id, value: coupon.value, transaction: tx });
    const redemptionId = redemption.id;

    if (coupon.type === 'credits') {
      const addCredits = Math.max(1, Number(coupon.value) || 0);
      const creditResult = await grantPerpetualCredits(
        user.id,
        addCredits,
        `兑换码充值 (${cleanCode})`,
        redemptionId,
        `coupon:${redemptionId}`,
        tx,
      );
      const nextCredits = Number(creditResult.perpetualCredits || 0);
      return { success: true, message: `成功充值 +${addCredits} 算力额度！当前总额度: ${nextCredits}`, code: cleanCode, type: coupon.type, value: coupon.value };
    }

    if (coupon.type === 'plan') {
      const planId = coupon.value || 'pro';
      const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();
      await couponRepo.upsertCouponSubscription({ userId: user.id, redemptionId, planId, periodEnd, transaction: tx });
      return { success: true, message: `成功开通 [${planId.toUpperCase()}] 会员权益（有效期 30 天）！`, code: cleanCode, type: coupon.type, value: coupon.value };
    }
    return { error: '兑换码类型无效' };
  });
}

export async function listCoupons(searchParams) {
  return couponRepo.listCoupons(searchParams);
}
