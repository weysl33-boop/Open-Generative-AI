import 'server-only';

import { logAudit } from '../admin/audit.js';
import * as creationRepo from '../repositories/creations.js';
import { createModerationCase } from '../repositories/moderation.js';

export function retryGenerationTask({ actor, creationId, chargeCredits = false, requestId }) {
  const original = creationRepo.findCreationById(creationId);
  if (!original) return { error: '原生成任务不存在' };

  const creditCost = chargeCredits ? Number(original.credit_cost || 0) : 0;
  const newCreation = creationRepo.createRetryCreation({
    parentCreation: original,
    creditCost,
  });

  // 异步触发真实上游任务执行器
  import('./taskWorker.js').then((worker) => {
    worker.executePendingCreation(newCreation.id).catch((err) => {
      console.error('[retryWorker] 执行重试任务异常:', err);
    });
  }).catch(() => {});

  logAudit({
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

export function flagCreationForModeration({ actor, creationId, reasonCode = 'manual_flag', requestId }) {
  const original = creationRepo.findCreationById(creationId);
  if (!original) return { error: '目标生成记录不存在' };

  const modCase = createModerationCase({
    creationId,
    reasonCode,
  });

  logAudit({
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
