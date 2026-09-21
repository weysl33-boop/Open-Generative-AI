import 'server-only';

import { execute, queryMany, nowIso, randomId } from '../db/index.js';

/**
 * 路由决策日志：只由后台读取（成本/路由分析），不对普通用户暴露。
 * 写入失败不能作废一次生成，因此调用方按需 catch。
 */
export async function insertRouteDecision({
  jobId,
  modelId,
  candidates = [],
  selectedProviderId,
  selectedProviderModelId,
  routingMode,
  weights = null,
  score = 0,
  costScore = 0,
  stabilityScore = 0,
  speedScore = 0,
  capacityScore = 0,
  selectionReason = null,
  transaction = null,
} = {}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const id = `rdl_${randomId()}`;
  await run(`
    INSERT INTO ai_studio.route_decision_logs
      (id, job_id, model_id, candidate_providers_json, selected_provider_id,
       selected_provider_model_id, routing_mode, score, cost_score, stability_score,
       speed_score, capacity_score, selection_reason, created_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, [
    id, jobId, modelId,
    JSON.stringify(candidates.map((c) => ({
      providerId: c.providerId,
      providerModelId: c.providerModelId,
      totalScore: c.totalScore,
    }))),
    selectedProviderId, selectedProviderModelId, routingMode,
    Number(score) || 0, Number(costScore) || 0, Number(stabilityScore) || 0,
    Number(speedScore) || 0, Number(capacityScore) || 0,
    // weights 不是表字段，但有它才能事后复现「为什么选了这家」。
    weights ? `${selectionReason || ''} | weights: ${JSON.stringify(weights)}` : selectionReason,
    nowIso(),
  ]);
  return id;
}

export async function listRouteDecisionsByJob(jobId) {
  return queryMany(`
    SELECT * FROM ai_studio.route_decision_logs
    WHERE job_id = $1
    ORDER BY created_at ASC
  `, [jobId]);
}
