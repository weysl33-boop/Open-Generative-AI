import { query, queryOne, execute, nowIso, randomId } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function listCreations(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.email ILIKE ${nextParameter()} OR c.user_id ILIKE ${nextParameter()} OR c.id ILIKE ${nextParameter()} OR c.label ILIKE ${nextParameter()} OR c.model ILIKE ${nextParameter()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const status = String(params.get('status') || '').trim();
  if (status) {
    clauses.push(`c.status = ${nextParameter()}`);
    sqlParams.push(status);
  }

  const studioId = String(params.get('studio_id') || '').trim();
  if (studioId) {
    clauses.push(`c.studio_id = ${nextParameter()}`);
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
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.email ILIKE ${nextParameter()} OR c.error_code ILIKE ${nextParameter()} OR c.error_reason ILIKE ${nextParameter()} OR c.model ILIKE ${nextParameter()})`);
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

export async function createRetryCreation({ parentCreation, creditCost = 0 }) {
  const id = randomId('gen');
  const now = nowIso();
  await execute(`
    INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, provider, model, parent_creation_id, metadata_json, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9::jsonb, $10, $10)
  `, [id, parentCreation.user_id, parentCreation.studio_id, parentCreation.label, creditCost, parentCreation.provider, parentCreation.model, parentCreation.id, JSON.stringify(parentCreation.metadata_json || {}), now]);
  return findCreationById(id);
}

export async function updateCreationStatus(id, { status, resultUrl, errorCode, errorReason, durationMs, actualCostUsd }) {
  const updates = ['updated_at = NOW()'];
  const params = [];
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  if (status !== undefined) {
    updates.push(`status = ${nextParameter()}`);
    params.push(status);
  }
  if (resultUrl !== undefined) {
    updates.push(`result_url = ${nextParameter()}`);
    params.push(resultUrl);
  }
  if (errorCode !== undefined) {
    updates.push(`error_code = ${nextParameter()}`);
    params.push(errorCode);
  }
  if (errorReason !== undefined) {
    updates.push(`error_reason = ${nextParameter()}`);
    params.push(errorReason);
  }
  if (durationMs !== undefined) {
    updates.push(`duration_ms = ${nextParameter()}`);
    params.push(durationMs);
  }
  if (actualCostUsd !== undefined) {
    updates.push(`actual_cost_usd = ${nextParameter()}`);
    params.push(actualCostUsd);
  }

  params.push(id);
  await execute(`UPDATE creations SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
  return await findCreationById(id);
}
