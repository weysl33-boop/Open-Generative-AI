import 'server-only';

import { execute, nowIso, randomId, withTransaction } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as creationRepo from '../repositories/creations.js';
import { insertCreditEntry } from '../repositories/credits.js';
import { updateUserCredits } from '../repositories/users.js';
import { createModerationCase } from '../repositories/moderation.js';

export async function reserveGeneration({ user, creditCost, modelConfig, endpoint }) {
  return withTransaction(async (tx) => {
    const current = await tx.queryOne('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    if (Number(current?.credits || 0) < creditCost) throw Object.assign(new Error('额度不足'), { code: 'INSUFFICIENT_CREDITS' });
    await updateUserCredits(tx, user.id, Number(current.credits) - creditCost);
    const ledgerEntryId = await insertCreditEntry(tx, { userId: user.id, delta: -creditCost, reason: `AI 生成消耗 - ${modelConfig?.name || endpoint}`, metadata: { model: endpoint, provider: modelConfig?.provider || 'muapi' } });
    const creationRecordId = randomId('gen');
    await tx.execute(`INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, provider, model, created_at, updated_at) VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7, $8, $8)`, [creationRecordId, user.id, modelConfig?.type || 'image', `调用 ${modelConfig?.name || endpoint}`, creditCost, modelConfig?.provider || 'muapi', endpoint, nowIso()]);
    return { ledgerEntryId, creationRecordId };
  });
}

export async function refundGeneration({ user, creditCost, creationRecordId, modelConfig, reason, error }) {
  if (!user || !creditCost) return;
  await withTransaction(async (tx) => {
    const current = await tx.queryOne('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    await updateUserCredits(tx, user.id, Number(current?.credits || 0) + creditCost);
    await insertCreditEntry(tx, { userId: user.id, delta: creditCost, reason: `${reason} - ${modelConfig?.name || 'model'}`, referenceId: creationRecordId, metadata: { error } });
    if (creationRecordId) await tx.execute("UPDATE creations SET status = 'failed', error_code = $1, error_reason = $2, updated_at = $3 WHERE id = $4", [error?.code || 'UPSTREAM_ERROR', String(error?.message || error || '').slice(0, 200), nowIso(), creationRecordId]);
  });
}

export function attachGenerationRequest(creationId, requestId) {
  return execute('UPDATE creations SET external_request_id = $1, updated_at = $2 WHERE id = $3', [requestId, nowIso(), creationId]);
}

export async function retryGenerationTask({ actor, creationId, chargeCredits = false, requestId }) {
  const original = await creationRepo.findCreationById(creationId);
  if (!original) return { error: '原生成任务不存在' };

  const creditCost = chargeCredits ? Number(original.credit_cost || 0) : 0;
  const newCreation = await creationRepo.createRetryCreation({
    parentCreation: original,
    creditCost,
  });

  // 异步触发真实上游任务执行器
  import('./taskWorker.js').then((worker) => {
    worker.executePendingCreation(newCreation.id).catch((err) => {
      console.error('[retryWorker] 执行重试任务异常:', err);
    });
  }).catch(() => {});

  await logAudit({
    actor,
    action: 'generations.retry',
    targetType: 'creation',
    targetId: original.id,
    riskLevel: 'medium',
    after: { retryCreationId: newCreation.id, chargeCredits, creditCost },
    requestId,
  });

  return { creation: newCreation };
}

export async function flagCreationForModeration({ actor, creationId, reasonCode = 'manual_flag', requestId }) {
  const original = await creationRepo.findCreationById(creationId);
  if (!original) return { error: '目标生成记录不存在' };

  const modCase = await createModerationCase({
    creationId,
    reasonCode,
  });

  await logAudit({
    actor,
    action: 'moderation.flag',
    targetType: 'creation',
    targetId: creationId,
    riskLevel: 'low',
    after: { moderationCaseId: modCase.id, reasonCode },
    requestId,
  });

  return { moderationCase: modCase };
}
