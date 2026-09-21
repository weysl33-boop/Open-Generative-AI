import 'server-only';

import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';

export async function createGenerationAttempt({
  creationId,
  attemptNumber,
  providerId,
  providerModelId,
  requestPayload = {},
  providerRequestId = null,
  status = 'submitted',
  transaction = null,
} = {}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const id = `att_${randomId()}`;
  const now = nowIso();

  await run(`
    INSERT INTO ai_studio.generation_attempts
      (id, creation_id, attempt_number, provider_id, provider_model_id,
       request_payload_json, provider_request_id, status, started_at, created_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $9)
  `, [
    id, creationId, attemptNumber, providerId, providerModelId,
    JSON.stringify(requestPayload || {}), providerRequestId, status, now,
  ]);

  return {
    id,
    creation_id: creationId,
    attempt_number: attemptNumber,
    provider_id: providerId,
    provider_model_id: providerModelId,
    status,
    started_at: now,
  };
}

const TERMINAL_ATTEMPT_STATUSES = new Set(['succeeded', 'failed', 'timeout', 'cancelled']);

export async function updateGenerationAttemptOutcome(id, {
  status,
  providerRequestId = null,
  durationMs = null,
  errorCode = null,
  errorReason = null,
  actualCostUsd = 0,
  metadata = {},
  transaction = null,
} = {}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  // 只有终态才盖章 completed_at：否则「已提交、等上游」的尝试一落地就成了已结束的尝试，
  // 恢复轮询时再也找不回它对应的渠道与上游任务号。
  const completedAt = TERMINAL_ATTEMPT_STATUSES.has(status) ? now : null;

  await run(`
    UPDATE ai_studio.generation_attempts
    SET status = $1, provider_request_id = COALESCE($2, provider_request_id),
        duration_ms = $3, error_code = $4, error_reason = $5,
        actual_cost_usd = $6, metadata_json = $7::jsonb, completed_at = COALESCE($8, completed_at)
    WHERE id = $9
  `, [
    status, providerRequestId, durationMs, errorCode, errorReason,
    actualCostUsd, JSON.stringify(metadata || {}), completedAt, id,
  ]);
}

export async function listAttemptsByCreationId(creationId) {
  return queryMany(`
    SELECT * FROM ai_studio.generation_attempts
    WHERE creation_id = $1
    ORDER BY attempt_number ASC
  `, [creationId]);
}

export async function countAttemptsByCreation(creationId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const row = await run(
    'SELECT count(*)::int AS attempts FROM ai_studio.generation_attempts WHERE creation_id = $1',
    [creationId],
  );
  return Number(row?.attempts || 0);
}

/** 当前仍未落终态的那次尝试（恢复轮询时用它找回渠道与上游任务号）。 */
export async function latestOpenAttempt(creationId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT * FROM ai_studio.generation_attempts
    WHERE creation_id = $1 AND status IN ('submitted', 'processing') AND completed_at IS NULL
    ORDER BY attempt_number DESC
    LIMIT 1
  `, [creationId]);
}

/**
 * 各网关当前占用中的尝试数。路由层用它做并发闸门：
 * 渠道并发已满时任务是排队，不是失败，所以这里只统计未落终态的尝试。
 */
export async function countInflightAttemptsByProvider(transaction = null) {
  const run = transaction?.query ? transaction.query.bind(transaction) : query;
  const rows = await run(`
    SELECT provider_id, count(*)::int AS inflight
    FROM ai_studio.generation_attempts
    WHERE status IN ('submitted', 'processing')
      AND completed_at IS NULL
    GROUP BY provider_id
  `);
  const map = new Map();
  for (const row of rows.rows || rows) map.set(row.provider_id, Number(row.inflight));
  return map;
}

