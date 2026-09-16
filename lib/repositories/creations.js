import { query, queryOne, execute, nowIso, randomId } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function listCreations(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push('(u.email LIKE $1 OR c.user_id LIKE $2 OR c.id LIKE $3 OR c.label LIKE $4 OR c.model LIKE $5)');
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const status = String(params.get('status') || '').trim();
  if (status) {
    clauses.push('c.status = ?');
    sqlParams.push(status);
  }

  const studioId = String(params.get('studio_id') || '').trim();
  if (studioId) {
    clauses.push('c.studio_id = ?');
    sqlParams.push(studioId);
  }

  const baseSql = `
    SELECT c.id, c.user_id, c.studio_id, c.label, c.result_url, c.status, c.credit_cost,
           c.actual_cost_usd, c.error_reason,
           c.provider, c.model, c.duration_ms, c.error_code, c.parent_creation_id, c.created_at, u.email
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'c',
  });
}

export async function listFailedCreations(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ["c.status NOT IN ('completed', 'success')"];
  const sqlParams = [];

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push('(u.email LIKE $1 OR c.error_code LIKE $2 OR c.error_reason LIKE $3 OR c.model LIKE $4)');
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const baseSql = `
    SELECT c.id, c.user_id, c.studio_id, c.label, c.status, c.credit_cost,
           c.actual_cost_usd, c.error_reason,
           c.provider, c.model, c.duration_ms, c.error_code, c.created_at, u.email
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'c',
  });
}

export async function getFailureClusters() {
  const res = await query(`
    SELECT COALESCE(error_code, 'UNKNOWN_ERROR') AS code,
           COUNT(*) AS count,
           MAX(created_at) AS last_occurred_at
    FROM creations
    WHERE status NOT IN ('completed', 'success')
    GROUP BY COALESCE(error_code, 'UNKNOWN_ERROR')
    ORDER BY count DESC
    LIMIT 10
  `);
  return res.rows;
}

export async function findCreationById(id) {
  return await queryOne(`
    SELECT c.*, u.email
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = $1
  `, [id]);
}

export async function updateCreationStatus(id, { status, resultUrl, errorCode, errorReason, durationMs, actualCostUsd }) {
  const updates = ['updated_at = NOW()'];
  const params = [];

  if (status !== undefined) {
    updates.push('status = ?');
    params.push(status);
  }
  if (resultUrl !== undefined) {
    updates.push('result_url = ?');
    params.push(resultUrl);
  }
  if (errorCode !== undefined) {
    updates.push('error_code = ?');
    params.push(errorCode);
  }
  if (errorReason !== undefined) {
    updates.push('error_reason = ?');
    params.push(errorReason);
  }
  if (durationMs !== undefined) {
    updates.push('duration_ms = ?');
    params.push(durationMs);
  }
  if (actualCostUsd !== undefined) {
    updates.push('actual_cost_usd = ?');
    params.push(actualCostUsd);
  }

  params.push(id);
  await execute(`UPDATE creations SET ${updates.join(', ')} WHERE id = $1`, params);
  return await findCreationById(id);
}
