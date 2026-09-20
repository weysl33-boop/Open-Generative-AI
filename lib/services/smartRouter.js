import 'server-only';

import { query, queryOne, execute, nowIso, randomId } from '../db/index.js';
import { listProviderModelsByModelId, getRoutingPolicy } from '../repositories/aiCatalog.js';
import { getServerProviderApiKey } from './providerSecrets.js';

export const ROUTING_MODES = Object.freeze({
  COST: 'cost',
  QUALITY: 'quality',
  STABILITY: 'stability',
  BALANCED: 'balanced',
});

export const DEFAULT_WEIGHTS = Object.freeze({
  cost: 0.40,
  success_rate: 0.30,
  speed: 0.20,
  capacity: 0.10,
});

/**
 * 智能路由决策引擎
 * 核心铁律：严格禁止跨模型降级！
 * 候选渠道必须来自同一个 Canonical Model，仅在同模型的多供应商渠道间选择与故障转移。
 */
export async function routeGenerationTask({
  jobId,
  modelId,
  parameters = {},
  excludedProviderIds = [],
  transaction = null,
  resolveCredential = getServerProviderApiKey,
} = {}) {
  if (!modelId) throw new Error('路由目标 modelId 不能为空');

  // 1. 获取该模型所有启用的渠道 ProviderModels
  const allProviderModels = await listProviderModelsByModelId(modelId, { enabledOnly: true });
  if (!allProviderModels || allProviderModels.length === 0) {
    throw Object.assign(new Error(`模型 ${modelId} 暂无可用供应商渠道`), { code: 'NO_ACTIVE_PROVIDERS' });
  }

  // 2. 获取该模型的路由策略 (若未独立配置，采用默认智能平衡)
  const policy = (await getRoutingPolicy(modelId, transaction)) || {
    routing_mode: ROUTING_MODES.BALANCED,
    weights: DEFAULT_WEIGHTS,
    failover_enabled: true,
  };

  const mode = policy.routing_mode || ROUTING_MODES.BALANCED;
  const weights = { ...DEFAULT_WEIGHTS, ...(policy.weights || {}) };

  // 3. 候选渠道严格过滤
  const candidates = [];
  const rejectedReasons = [];

  for (const pm of allProviderModels) {
    // 过滤已尝试失败排除的渠道（故障转移时）
    if (excludedProviderIds.includes(pm.provider_id)) {
      rejectedReasons.push({ providerId: pm.provider_id, reason: 'ALREADY_ATTEMPTED_FAILED' });
      continue;
    }

    // 过滤未配置凭据的渠道（无 env key 且无加密存储密钥）—— 硬过滤，
    // 绝不把流量导向一个没有密钥的直连通道。
    const channelApiKey = await resolveCredential({ provider: pm.provider_id });
    if (!channelApiKey) {
      rejectedReasons.push({ providerId: pm.provider_id, reason: 'PROVIDER_NOT_CONFIGURED' });
      continue;
    }

    // 过滤熔断中的渠道 (open / circuit_open)
    if (pm.circuit_state === 'open' || pm.circuit_state === 'circuit_open') {
      rejectedReasons.push({ providerId: pm.provider_id, reason: 'CIRCUIT_OPEN' });
      continue;
    }

    // 过滤严重不健康的渠道
    if (pm.health_status === 'disabled' || pm.health_status === 'unhealthy') {
      rejectedReasons.push({ providerId: pm.provider_id, reason: `UNHEALTHY (${pm.health_status})` });
      continue;
    }

    // 过滤余额明确透支且配置了限制的渠道
    if (Number(pm.provider_balance || 0) < 0 && pm.provider_type === 'official') {
      rejectedReasons.push({ providerId: pm.provider_id, reason: 'INSUFFICIENT_BALANCE' });
      continue;
    }

    candidates.push(pm);
  }

  if (candidates.length === 0) {
    const reasonMsg = rejectedReasons.map((r) => `${r.providerId}:${r.reason}`).join('; ');
    throw Object.assign(new Error(`模型 ${modelId} 所有备选渠道均不可用 (${reasonMsg})`), {
      code: 'ALL_PROVIDERS_UNAVAILABLE',
      details: rejectedReasons,
    });
  }

  // 4. 计算综合评分 (RouteScore)
  const scoredCandidates = candidates.map((pm) => {
    const costConfig = pm.cost_config || {};
    const baseCost = Number(costConfig.base_cost || 0);

    // 成本得分 (0 - 100): 成本越低，得分越高
    const costScore = Math.max(0, Math.min(100, Math.round(100 - baseCost * 50)));

    // 稳定性得分 (0 - 100): 官方直连 / healthy 加分
    let stabilityScore = 80;
    if (pm.health_status === 'healthy') stabilityScore += 15;
    if (pm.circuit_state === 'closed') stabilityScore += 5;
    if (pm.provider_type === 'official') stabilityScore += 5;
    stabilityScore = Math.min(100, stabilityScore);

    // 速度得分 (0 - 100): 默认基准
    const speedScore = pm.provider_type === 'official' ? 90 : 80;

    // 容量与并发得分 (0 - 100)
    const capacityScore = Math.min(100, (Number(pm.concurrency_limit || 10) / 20) * 100);

    // 依据路由模式计算最终 RouteScore
    let totalScore = 0;
    if (mode === ROUTING_MODES.COST) {
      totalScore = costScore * 0.7 + stabilityScore * 0.2 + speedScore * 0.1;
    } else if (mode === ROUTING_MODES.QUALITY) {
      totalScore = stabilityScore * 0.5 + speedScore * 0.3 + (pm.provider_type === 'official' ? 20 : 0);
    } else if (mode === ROUTING_MODES.STABILITY) {
      totalScore = stabilityScore * 0.6 + costScore * 0.2 + capacityScore * 0.2;
    } else {
      // 默认智能平衡 (Balanced)
      totalScore =
        costScore * Number(weights.cost || 0.4) +
        stabilityScore * Number(weights.success_rate || 0.3) +
        speedScore * Number(weights.speed || 0.2) +
        capacityScore * Number(weights.capacity || 0.1);
    }

    // 叠加渠道基础优先级微调 (priority 100 对应 +5分)
    totalScore += (Number(pm.priority || 100) - 100) * 0.1;

    return {
      providerModel: pm,
      providerId: pm.provider_id,
      providerModelId: pm.provider_model_id,
      costScore,
      stabilityScore,
      speedScore,
      capacityScore,
      totalScore: Number(totalScore.toFixed(2)),
    };
  });

  // 按得分由高到低排序，首位为获胜渠道
  scoredCandidates.sort((a, b) => b.totalScore - a.totalScore);
  const winner = scoredCandidates[0];

  const selectionReason = `模式: ${mode}; 首选渠道: ${winner.providerId} (${winner.providerModelId}), 得分: ${winner.totalScore} (成本:${winner.costScore}, 稳定:${winner.stabilityScore}, 速度:${winner.speedScore})`;

  // 5. 记录路由决策日志 (写入 ai_studio.route_decision_logs)
  if (jobId) {
    const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
    const qOne = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
    const creationExists = await qOne('SELECT 1 FROM ai_studio.creations WHERE id = $1', [jobId]);
    if (creationExists) {
      const logId = `rdl_${randomId()}`;
      await run(`
        INSERT INTO ai_studio.route_decision_logs
          (id, job_id, model_id, candidate_providers_json, selected_provider_id,
           selected_provider_model_id, routing_mode, score, cost_score, stability_score,
           speed_score, capacity_score, selection_reason, created_at)
        VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        logId, jobId, modelId,
        JSON.stringify(scoredCandidates.map((c) => ({
          providerId: c.providerId,
          providerModelId: c.providerModelId,
          totalScore: c.totalScore,
        }))),
        winner.providerId,
        winner.providerModelId,
        mode,
        winner.totalScore,
        winner.costScore,
        winner.stabilityScore,
        winner.speedScore,
        winner.capacityScore,
        selectionReason,
        nowIso(),
      ]).catch((err) => console.error('[smartRouter/logDecision]', err.message));
    }
  }

  return {
    selectedRoute: winner.providerModel,
    selectedProvider: winner.providerModel,
    selectedProviderId: winner.providerId,
    selectedProviderModelId: winner.providerModelId,
    winner,
    allCandidates: scoredCandidates,
    routingMode: mode,
    mode,
    finalScore: winner.totalScore,
    modelId,
    selectionReason,
  };
}
