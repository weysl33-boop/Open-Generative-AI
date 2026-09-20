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

  await run(`
    UPDATE ai_studio.generation_attempts
    SET status = $1, provider_request_id = COALESCE($2, provider_request_id),
        duration_ms = $3, error_code = $4, error_reason = $5,
        actual_cost_usd = $6, metadata_json = $7::jsonb, completed_at = $8
    WHERE id = $9
  `, [
    status, providerRequestId, durationMs, errorCode, errorReason,
    actualCostUsd, JSON.stringify(metadata || {}), now, id,
  ]);
}

export async function listAttemptsByCreationId(creationId) {
  return queryMany(`
    SELECT * FROM ai_studio.generation_attempts
    WHERE creation_id = $1
    ORDER BY attempt_number ASC
  `, [creationId]);
}
