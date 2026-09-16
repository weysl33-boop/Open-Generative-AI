import 'server-only';

import { withTransaction } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as userRepo from '../repositories/users.js';
import * as creditRepo from '../repositories/credits.js';

export async function adjustUserCredits({ actor, userId, delta, reason, referenceId, requestId }) {
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

  const user = await userRepo.findUserById(userId);
  if (!user) return { error: '目标用户不存在' };

  const currentCredits = Number(user.credits || 0);
  const nextCredits = currentCredits + amount;
  if (nextCredits < 0) {
    return { error: `扣减后额度不能小于 0（当前余额：${currentCredits}）` };
  }

  const result = await withTransaction(async (tx) => {
    const locked = await tx.queryOne('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!locked) throw new Error('目标用户不存在');
    const lockedNextCredits = Number(locked.credits || 0) + amount;
    if (lockedNextCredits < 0) throw new Error('余额不足');
    await userRepo.updateUserCredits(tx, userId, lockedNextCredits);
    const ledgerId = await creditRepo.insertCreditEntry(tx, {
      userId,
      delta: amount,
      reason: cleanReason,
      referenceId: referenceId ? String(referenceId).slice(0, 120) : null,
      actorUserId: actor.id,
      metadata: { actorEmail: actor.email, requestId },
    });

    return {
      userId,
      credits: lockedNextCredits,
      ledgerId,
    };
  });
  await logAudit({ actor, action: 'credits.adjust', targetType: 'user', targetId: userId, riskLevel: 'high', before: { credits: currentCredits }, after: { ...result, delta: amount, reason: cleanReason }, requestId });
  return result;
}
