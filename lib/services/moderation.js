import 'server-only';

import { execute, withTransaction } from '../db/index.js';
import { logAudit } from '../admin/audit.js';
import * as modRepo from '../repositories/moderation.js';

export async function resolveModeration({ actor, caseId, resolution, notes, requestId }) {
  if (!['approved', 'rejected', 'dismissed'].includes(resolution)) {
    return { error: '审核判定状态无效' };
  }

  const existing = await modRepo.findModerationCaseById(caseId);
  if (!existing) return { error: '审核案件不存在' };

  const result = await withTransaction(async (tx) => {
    const nextStatus = resolution === 'approved' ? 'approved' : 'rejected';
    await tx.execute(`UPDATE moderation_cases SET status = $1, resolution = $2, reviewer_id = $3, notes = $4, reviewed_at = $5 WHERE id = $6`, [nextStatus, resolution, actor.id, notes || null, new Date().toISOString(), caseId]);
    const updatedCase = await tx.queryOne(`SELECT * FROM moderation_cases WHERE id = $1`, [caseId]);
      id: caseId,
      status: nextStatus,
      resolution,
      reviewerId: actor.id,
      notes,
    });

    // 如果违规拒绝，将生成记录状态标记为 moderated_rejected
    if (resolution === 'rejected') {
      await tx.execute('UPDATE creations SET status = \'moderated_rejected\' WHERE id = $1', [existing.creation_id]);
    }

    return { moderationCase: updatedCase };
  });
  await logAudit({ actor, action: 'moderation.resolve', targetType: 'moderation_case', targetId: caseId, riskLevel: 'medium', before: { status: existing.status }, after: { status: result.moderationCase?.status, resolution, notes }, requestId });
  return result;
}
