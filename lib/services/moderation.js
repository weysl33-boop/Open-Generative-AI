import 'server-only';

import { withTransaction } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as modRepo from '../repositories/moderation.js';

export async function reportCreation({ userId, creationId, reasonCode = 'user_reported' }) {
  const result = await withTransaction(async (tx) => {
    const creation = await modRepo.findOwnedCreationForReport({ creationId, userId, transaction: tx });
    if (!creation) return { error: '未找到指定作品记录' };
    const moderationId = await modRepo.createModerationCaseInTransaction({ creationId, reasonCode, transaction: tx });
    // 审核状态属于 moderation_cases；生成任务状态机只表示任务执行生命周期，不能被审核流程覆盖。
    return { caseId: moderationId };
  });
  return result;
}

export async function resolveModeration({ actor, caseId, resolution, notes, requestId }) {
  if (!['approved', 'rejected', 'dismissed'].includes(resolution)) {
    return { error: '审核判定状态无效' };
  }

  const existing = await modRepo.findModerationCaseById(caseId);
  if (!existing) return { error: '审核案件不存在' };

  const result = await withTransaction(async (tx) => {
    const nextStatus = resolution === 'approved' ? 'approved' : 'rejected';
    const updatedCase = await modRepo.resolveModerationCaseInTransaction({ id: caseId, status: nextStatus, resolution, reviewerId: actor.id, notes, transaction: tx });
    await logAudit({ actor, action: 'moderation.resolve', targetType: 'moderation_case', targetId: caseId, riskLevel: 'medium', before: { status: existing.status }, after: { status: updatedCase?.status, resolution, notes }, requestId, transaction: tx });
    return { moderationCase: updatedCase };
  });
  return result;
}
