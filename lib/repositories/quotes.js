import 'server-only';

import { queryOne, execute, nowIso, randomId } from '../db/index.js';

/**
 * 报价单落库。generation_quotes 由 019 建表，这里只做读写，
 * 不再新建同功能表。
 */
export async function insertGenerationQuote({
  userId,
  modelId,
  parameters = {},
  credits,
  pricingBreakdown = {},
  estimatedProviderCostUsd = 0,
  ttlMinutes = 5,
  consumedAt = null,
  transaction = null,
} = {}) {
  const id = `quote_${randomId()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;

  await run(`
    INSERT INTO ai_studio.generation_quotes
      (id, user_id, model_id, parameters_json, credits_quoted, pricing_breakdown_json,
       estimated_provider_cost_usd, expires_at, consumed_at, created_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9, $10)
  `, [
    id, userId, modelId, JSON.stringify(parameters || {}), credits,
    JSON.stringify(pricingBreakdown || {}), estimatedProviderCostUsd,
    expiresAt.toISOString(), consumedAt, nowIso(),
  ]);

  return { quoteId: id, expiresAt: expiresAt.toISOString() };
}

export async function lockGenerationQuote(quoteId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run('SELECT * FROM ai_studio.generation_quotes WHERE id = $1 FOR UPDATE', [quoteId]);
}

export async function consumeGenerationQuote(quoteId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await run('UPDATE ai_studio.generation_quotes SET consumed_at = $1 WHERE id = $2 AND consumed_at IS NULL', [nowIso(), quoteId]);
}
