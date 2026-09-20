import 'server-only';

import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';

export async function insertProviderCostRecord({
  jobId,
  attemptId = null,
  providerId,
  modelId,
  creditsCharged = 0,
  estimatedCostUsd = 0,
  actualCostUsd = 0,
  currency = 'USD',
  transaction = null,
} = {}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const id = `pcr_${randomId()}`;
  const now = nowIso();

  await run(`
    INSERT INTO ai_studio.provider_cost_records
      (id, job_id, attempt_id, provider_id, model_id, credits_charged,
       estimated_cost_usd, actual_cost_usd, currency, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
  `, [
    id, jobId, attemptId, providerId, modelId,
    Number(creditsCharged || 0), Number(estimatedCostUsd || 0),
    Number(actualCostUsd || 0), currency, now,
  ]);

  return id;
}
