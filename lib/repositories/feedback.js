import { query, queryOne, execute, nowIso } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function insertFeedbackReport({ id, userId, kind, title, pageUrl, detail }) {
  const now = nowIso();
  await execute(`
    INSERT INTO feedback_reports
    (id, user_id, kind, title, page_url, detail, status, reward_coins, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0, $7, $7)
  `, [id, userId, kind, title, pageUrl, detail, now]);
}

export async function findFeedbackById(id) {
  return await queryOne('SELECT * FROM feedback_reports WHERE id = $1', [id]);
}

export async function listFeedbackByUser(userId, { limit = 20, offset = 0 } = {}) {
  const rows = await query(`
    SELECT id, kind, title, page_url, status, reward_coins, review_note, reviewed_at, created_at
    FROM feedback_reports
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);
  return rows.rows;
}

/**
 * 以 status='pending' 作为并发闸门：只有还在待审的那一次裁决能写进去并 RETURNING，
 * 其余并发裁决拿到 null，由调用方判为"已被其他管理员处理"。
 */
export async function claimFeedbackReview({ feedbackId, resolution, rewardCoins, reviewerId, note, rewardTransactionId, tx }) {
  const now = nowIso();
  return await tx.queryOne(`
    UPDATE feedback_reports
    SET status = $1,
        reward_coins = $2,
        reviewer_id = $3,
        review_note = $4,
        reviewed_at = $5,
        reward_transaction_id = $6,
        updated_at = $5
    WHERE id = $7 AND status = 'pending'
    RETURNING *
  `, [resolution, rewardCoins, reviewerId, note, now, rewardTransactionId, feedbackId]);
}

export async function pageFeedbackForAdmin(searchParams) {
  const params = toSearchParams(searchParams);
  const where = ['1=1'];
  const values = [];
  if (params.get('status')) { where.push(`f.status = $${values.length + 1}`); values.push(String(params.get('status')).trim()); }
  if (params.get('kind')) { where.push(`f.kind = $${values.length + 1}`); values.push(String(params.get('kind')).trim()); }

  return pagedQuery({
    baseSql: `
      SELECT f.id, f.user_id, f.kind, f.title, f.page_url, f.detail, f.status, f.reward_coins,
             f.review_note, f.reviewed_at, f.created_at, u.user_number, u.email, u.avatar_url
      FROM feedback_reports f JOIN users u ON u.id = f.user_id
      WHERE ${where.join(' AND ')}
    `,
    params: values,
    searchParams: params,
    tableAlias: 'f',
  });
}
