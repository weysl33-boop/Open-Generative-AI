import 'server-only';

import { withTransaction, randomId } from '../db/index.js';
import { grantFeedbackRewardCoins } from '../financial/currencyService.js';
import { findFeedbackKind } from '../feedback/catalog.js';
import { logAudit } from '../admin/audit.js';
import {
  claimFeedbackReview,
  findFeedbackById,
  insertFeedbackReport,
  listFeedbackByUser,
  pageFeedbackForAdmin,
} from '../repositories/feedback.js';

const MAX_TITLE = 200;
const MAX_DETAIL = 4000;

function sanitizeSubmit({ kind, title, pageUrl, detail }) {
  const resolved = findFeedbackKind(kind);
  if (!resolved) return { error: '提交类型无效，请重新选择' };

  const cleanTitle = String(title || '').trim().slice(0, MAX_TITLE);
  const cleanDetail = String(detail || '').trim().slice(0, MAX_DETAIL);
  const cleanPageUrl = String(pageUrl || '').trim().slice(0, 500);

  if (cleanTitle.length < 5) return { error: '请填写不少于 5 个字的标题，方便定位问题' };
  if (cleanDetail.length < 20) return { error: '描述不少于 20 个字，请写清复现步骤或改进理由' };

  return { kind: resolved, title: cleanTitle, detail: cleanDetail, pageUrl: cleanPageUrl || null };
}

export async function submitFeedback({ userId, ...input }) {
  const payload = sanitizeSubmit(input);
  if (payload.error) return { error: payload.error };

  const id = randomId('fb');
  await insertFeedbackReport({
    id,
    userId,
    kind: payload.kind.id,
    title: payload.title,
    pageUrl: payload.pageUrl,
    detail: payload.detail,
  });

  return { feedbackId: id, kind: payload.kind.id };
}

export async function listMyFeedback(userId, { limit = 20, offset = 0 } = {}) {
  const rows = await listFeedbackByUser(userId, { limit, offset });
  return rows.map(mapRow);
}

/**
 * 审核并结清硬币奖励。采纳时按管理员裁定的数量发放，一笔建议最多发放一次：
 * 发放本身以 feedback:<id>:reward 作为幂等键记账，重复裁决只会命中已有分录。
 */
export async function reviewFeedback({ actor, feedbackId, resolution, rewardCoins, note, requestId }) {
  if (!['accepted', 'rejected'].includes(resolution)) {
    return { error: '审核结论无效' };
  }

  const existing = await findFeedbackById(feedbackId);
  if (!existing) return { error: '提交记录不存在' };
  if (existing.status !== 'pending') return { error: '该提交已审核，不能重复裁决' };

  let amount = 0;
  let rewardTransactionId = null;

  if (resolution === 'accepted') {
    const fallback = findFeedbackKind(existing.kind)?.rewardDefault ?? 0;
    amount = Number.isFinite(Number(rewardCoins)) && Number(rewardCoins) > 0 ? Number(rewardCoins) : fallback;
    if (amount <= 0) return { error: '采纳需要填写发放数量' };

    const granted = await grantFeedbackRewardCoins({
      userId: existing.user_id,
      feedbackId: existing.id,
      amount,
      note: `采纳建议《${existing.title.slice(0, 30)}》发放硬币奖励`,
    });
    rewardTransactionId = granted.transactionId;
  }

  const updated = await withTransaction(async (tx) => {
    const row = await claimFeedbackReview({
      feedbackId,
      resolution,
      rewardCoins: resolution === 'accepted' ? amount : 0,
      reviewerId: actor.id,
      note: String(note || '').slice(0, 500) || null,
      rewardTransactionId: rewardTransactionId || null,
      tx,
    });
    if (!row) return null;

    await logAudit({
      actor,
      action: 'feedback.review',
      targetType: 'feedback_report',
      targetId: feedbackId,
      riskLevel: 'medium',
      before: { status: existing.status },
      after: { status: resolution, rewardCoins: amount, note },
      requestId,
      transaction: tx,
    });
    return row;
  });

  if (!updated) return { error: '该提交已被其他管理员处理，请刷新后重试' };
  return { feedback: mapRow(updated), rewardedCoins: amount };
}

function mapRow(row) {
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    pageUrl: row.page_url,
    detail: row.detail,
    status: row.status,
    rewardCoins: Number(row.reward_coins || 0),
    reviewNote: row.review_note,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    userId: row.user_id,
    userEmail: row.email,
  };
}

export async function listFeedbackForAdmin(searchParams) {
  return pageFeedbackForAdmin(searchParams);
}
