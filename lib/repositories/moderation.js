import 'server-only';

import { execute, nowIso, queryOne, randomId } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function listModerationCases(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const values = [];
  if (params.get('status')) { clauses.push('m.status = $1'); values.push(String(params.get('status')).trim()); }
  return pagedQuery({
    baseSql: `
      SELECT m.id, m.creation_id, m.status, m.reason_code, m.resolution, m.reviewer_id, m.notes, m.reviewed_at, m.created_at,
             c.studio_id, c.label, c.result_url, c.user_id, u.email
      FROM moderation_cases m JOIN creations c ON c.id = m.creation_id JOIN users u ON u.id = c.user_id
      WHERE ${clauses.join(' AND ')}
    `,
    params: values, searchParams: params, tableAlias: 'm',
  });
}

export async function findModerationCaseById(id) {
  return queryOne(`
    SELECT m.*, c.studio_id, c.label, c.result_url, c.metadata_json, u.email
    FROM moderation_cases m JOIN creations c ON c.id = m.creation_id JOIN users u ON u.id = c.user_id
    WHERE m.id = $1
  `, [id]);
}

export async function resolveModerationCase({ id, status, resolution, reviewerId, notes }) {
  await execute(`
    UPDATE moderation_cases SET status = $1, resolution = $2, reviewer_id = $3, notes = $4, reviewed_at = $5 WHERE id = $6
  `, [status, resolution, reviewerId, notes || null, nowIso(), id]);
  return findModerationCaseById(id);
}

export async function findOwnedCreationForReport({ creationId, userId, transaction }) {
  return transaction.queryOne('SELECT id, status FROM creations WHERE id = $1 AND user_id = $2 FOR UPDATE', [creationId, userId]);
}

export async function createModerationCaseInTransaction({ creationId, reasonCode = 'user_reported', transaction }) {
  const id = randomId('mod');
  await transaction.execute("INSERT INTO moderation_cases (id, creation_id, status, reason_code, created_at) VALUES ($1, $2, 'pending', $3, $4)", [id, creationId, reasonCode, nowIso()]);
  return id;
}

export async function resolveModerationCaseInTransaction({ id, status, resolution, reviewerId, notes, transaction }) {
  await transaction.execute(`
    UPDATE moderation_cases SET status = $1, resolution = $2, reviewer_id = $3, notes = $4, reviewed_at = $5 WHERE id = $6
  `, [status, resolution, reviewerId, notes || null, nowIso(), id]);
  return transaction.queryOne('SELECT * FROM moderation_cases WHERE id = $1', [id]);
}

export async function createModerationCase({ creationId, reasonCode = 'manual_flag' }) {
  const id = randomId('mod');
  await execute(`INSERT INTO moderation_cases (id, creation_id, status, reason_code, created_at) VALUES ($1, $2, 'pending', $3, $4)`, [id, creationId, reasonCode, nowIso()]);
  return findModerationCaseById(id);
}
