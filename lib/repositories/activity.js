import crypto from 'node:crypto';
import { execute, nowIso, query, queryOne, withTransaction } from '../db/pg.js';

function randomId(prefix = 'act') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export async function insertActivityLog({
  userId = null,
  sessionId = null,
  category = 'general',
  action,
  targetType = null,
  targetId = null,
  modelName = null,
  metadata = {},
  ip = null,
  userAgent = null,
}) {
  if (!action) return null;
  const id = randomId('act');
  const now = nowIso();
  const sql = `
    INSERT INTO sys_core.user_activity_logs (
      id, user_id, session_id, event_category, event_action,
      target_type, target_id, model_name, metadata_json,
      ip, user_agent, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $11, $12)
    RETURNING id
  `;
  return await queryOne(sql, [
    id, userId, sessionId, category, action,
    targetType, targetId, modelName, JSON.stringify(metadata || {}),
    ip, userAgent ? String(userAgent).slice(0, 500) : null, now
  ]);
}

export async function getDailyHeatmap(userId) {
  // 聚合过去 365 天由真实生成任务和活跃行为组成的统计
  const sql = `
    WITH dates AS (
      SELECT DATE(created_at) AS active_date, COUNT(*)::int AS count
      FROM ai_studio.creations
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '365 days'
      GROUP BY DATE(created_at)
      UNION ALL
      SELECT DATE(created_at) AS active_date, COUNT(*)::int AS count
      FROM sys_core.user_activity_logs
      WHERE user_id = $1 AND created_at >= NOW() - INTERVAL '365 days'
      GROUP BY DATE(created_at)
    )
    SELECT active_date::text AS date, SUM(count)::int AS count
    FROM dates
    GROUP BY active_date
    ORDER BY active_date ASC
  `;
  const res = await query(sql, [userId]);
  const dateMap = {};
  res.rows.forEach(r => {
    dateMap[r.date] = (dateMap[r.date] || 0) + Number(r.count || 0);
  });
  return dateMap;
}

export async function getCreationMetrics(userId) {
  const sql = `
    SELECT
      COUNT(*)::int AS total_creations,
      COALESCE(SUM(credit_cost), 0)::int AS total_credits,
      COUNT(DISTINCT DATE(created_at))::int AS active_days
    FROM ai_studio.creations
    WHERE user_id = $1
  `;
  const row = await queryOne(sql, [userId]);
  return {
    totalCreations: Number(row?.total_creations || 0),
    totalCredits: Number(row?.total_credits || 0),
    activeDays: Number(row?.active_days || 0),
  };
}

export async function getTopModels(userId, limit = 5) {
  const sql = `
    SELECT
      COALESCE(NULLIF(model, ''), 'FLUX.1-dev') AS model_name,
      COUNT(*)::int AS usage_count
    FROM ai_studio.creations
    WHERE user_id = $1 AND model IS NOT NULL AND model != ''
    GROUP BY model_name
    ORDER BY usage_count DESC
    LIMIT $2
  `;
  const res = await query(sql, [userId, limit]);
  const total = res.rows.reduce((sum, r) => sum + Number(r.usage_count), 0);
  return res.rows.map(r => ({
    model: r.model_name,
    count: Number(r.usage_count),
    percentage: total > 0 ? Math.round((Number(r.usage_count) / total) * 100) : 0,
  }));
}

export async function getModelPreferences(userId) {
  const sql = `
    SELECT
      COALESCE(NULLIF(studio_id, ''), 'image') AS category,
      COUNT(*)::int AS count
    FROM ai_studio.creations
    WHERE user_id = $1
    GROUP BY category
    ORDER BY count DESC
  `;
  const res = await query(sql, [userId]);
  const total = res.rows.reduce((sum, r) => sum + Number(r.count), 0);
  return res.rows.map(r => ({
    category: r.category,
    count: Number(r.count),
    percentage: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
  }));
}

export async function toggleFollow(followerId, followingId) {
  if (followerId === followingId) return { error: 'CANNOT_FOLLOW_SELF', message: '不能关注自己' };
  return withTransaction(async (tx) => {
    const existing = await tx.queryOne(
      'SELECT id FROM ai_studio.user_follows WHERE follower_id = $1 AND following_id = $2',
      [followerId, followingId]
    );
    if (existing) {
      await tx.execute('DELETE FROM ai_studio.user_follows WHERE id = $1', [existing.id]);
      await tx.execute('UPDATE auth_usr.users SET followers_count = GREATEST(0, followers_count - 1) WHERE id = $1', [followingId]);
      await tx.execute('UPDATE auth_usr.users SET following_count = GREATEST(0, following_count - 1) WHERE id = $1', [followerId]);
      return { following: false };
    } else {
      const followId = randomId('flw');
      await tx.execute(
        'INSERT INTO ai_studio.user_follows (id, follower_id, following_id, created_at) VALUES ($1, $2, $3, $4)',
        [followId, followerId, followingId, nowIso()]
      );
      await tx.execute('UPDATE auth_usr.users SET followers_count = followers_count + 1 WHERE id = $1', [followingId]);
      await tx.execute('UPDATE auth_usr.users SET following_count = following_count + 1 WHERE id = $1', [followerId]);
      return { following: true };
    }
  });
}

export async function checkIsFollowing(followerId, followingId) {
  if (!followerId || !followingId) return false;
  const row = await queryOne(
    'SELECT 1 FROM ai_studio.user_follows WHERE follower_id = $1 AND following_id = $2',
    [followerId, followingId]
  );
  return Boolean(row);
}

export async function getUserFollowStats(userId) {
  const row = await queryOne('SELECT followers_count, following_count FROM auth_usr.users WHERE id = $1', [userId]);
  return {
    followersCount: Number(row?.followers_count || 0),
    followingCount: Number(row?.following_count || 0),
  };
}
