import crypto from 'node:crypto';
import { query, queryOne, execute, nowIso } from '../db/pg.js';

function randomId(prefix = 'ntf') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export async function getUserNotifications(userId, limit = 20) {
  if (!userId) return [];
  const sql = `
    SELECT id, user_id, title, content, type, link_url, is_read, created_at
    FROM sys_core.user_notifications
    WHERE user_id = $1
    ORDER BY is_read ASC, created_at DESC
    LIMIT $2
  `;
  const res = await query(sql, [userId, Math.min(50, limit)]);
  return res.rows;
}

export async function getUnreadNotificationCount(userId) {
  if (!userId) return 0;
  const sql = `
    SELECT COUNT(*)::int AS count
    FROM sys_core.user_notifications
    WHERE user_id = $1 AND is_read = FALSE
  `;
  const row = await queryOne(sql, [userId]);
  return Number(row?.count || 0);
}

export async function markAllNotificationsAsRead(userId) {
  if (!userId) return 0;
  const sql = `
    UPDATE sys_core.user_notifications
    SET is_read = TRUE
    WHERE user_id = $1 AND is_read = FALSE
  `;
  return await execute(sql, [userId]);
}

export async function createNotification({ userId, title, content, type = 'system', linkUrl = null }) {
  if (!userId || !title) return null;
  const id = randomId('ntf');
  const sql = `
    INSERT INTO sys_core.user_notifications (id, user_id, title, content, type, link_url, is_read, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, FALSE, $7)
    RETURNING *
  `;
  return await queryOne(sql, [id, userId, title, content, type, linkUrl, nowIso()]);
}
