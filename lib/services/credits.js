import 'server-only';

import { adjustPerpetualCredits, getCreditWallet } from '../financial/creditService.js';
import { logAudit } from '../admin/audit.js';
import * as userRepo from '../repositories/users.js';
import { getLockedCreditWallet, listUserCreditLedger } from '../repositories/credits.js';
import { withTransaction } from '../db/index.js';

export async function getUserCreditLedger(userId, limit = 50) {
  return listUserCreditLedger(userId, limit);
}

export async function getCreditBalance(userId) {
  const wallet = await getCreditWallet(userId);
  return wallet ? wallet.totalAvailable : userRepo.getLegacyCredits(userId);
}

export async function adjustUserCredits({ actor, userId, delta, reason, referenceId, requestId, idempotencyKey }) {
  const amount = Number(delta);
  if (!Number.isInteger(amount) || amount === 0) {
    return { error: '额度调整必须是非零整数' };
  }

  // 支持管理员具有单次限额保护
  if (actor.role === 'support_admin' && Math.abs(amount) > 500) {
    return { error: '支持人员单次调额上限为 500 额度' };
  }

  if (Math.abs(amount) > 100000) {
    return { error: '单次调整额度不能超过 100,000' };
  }

  const cleanReason = String(reason || '').trim();
  if (!cleanReason || cleanReason.length > 200) {
    return { error: '请填写 1–200 字的调额原因' };
  }

  return await withTransaction(async (tx) => {
    const user = await userRepo.findUserById(userId, tx);
    if (!user) return { error: '目标用户不存在' };

    const wallet = await getLockedCreditWallet(userId, tx);
    const currentCredits = wallet
      ? Number(wallet.daily_free_credits || 0) + Number(wallet.subscription_credits || 0) + Number(wallet.perpetual_credits || 0)
      : Number(user.credits || 0);
    const nextCredits = currentCredits + amount;
    if (nextCredits < 0) {
      return { error: `扣减后额度不能小于 0（当前余额：${currentCredits}）` };
    }

    const result = await adjustPerpetualCredits({
      userId,
      delta: amount,
      reason: cleanReason,
      referenceId: referenceId ? String(referenceId).slice(0, 120) : null,
      actorUserId: actor.id,
      idempotencyKey: idempotencyKey ? `admin-credit:${idempotencyKey}` : null,
      transaction: tx,
    });
    await logAudit({ actor, action: 'credits.adjust', targetType: 'user', targetId: userId, riskLevel: 'high', before: { credits: currentCredits }, after: { ...result, delta: amount, reason: cleanReason }, requestId, transaction: tx });
    return result;
  });
}
