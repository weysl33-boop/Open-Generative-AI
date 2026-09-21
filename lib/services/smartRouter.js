import 'server-only';

import { hasProviderAdapter } from '../adapters/index.js';
import { costUsdToNumber, isPrimaryChannel } from '../modelCenter/routing.js';
import { countInflightAttemptsByProvider } from '../repositories/attempts.js';
import { getCanonicalModelById, getRoutingPolicy, listProviderModelsByModelId } from '../repositories/aiCatalog.js';
import { insertRouteDecision } from '../repositories/routeDecisions.js';
import { getServerProviderApiKey } from './providerSecrets.js';

export const ROUTING_MODES = Object.freeze({
  COST: 'cost',
  QUALITY: 'quality',
  STABILITY: 'stability',
  BALANCED: 'balanced',
});

// 模式只决定「没显式配置权重时」的默认权重比例。
// 任何一档都可以被 routing_policies.weights 覆盖，不允许在代码里写死评分公式。
export const MODE_WEIGHTS = Object.freeze({
  cost: Object.freeze({ cost: 0.70, success_rate: 0.15, speed: 0.10, capacity: 0.05 }),
  quality: Object.freeze({ cost: 0.10, success_rate: 0.55, speed: 0.25, capacity: 0.10 }),
  stability: Object.freeze({ cost: 0.15, success_rate: 0.60, speed: 0.10, capacity: 0.15 }),
  balanced: Object.freeze({ cost: 0.40, success_rate: 0.30, speed: 0.20, capacity: 0.10 }),
});

export const DEFAULT_WEIGHTS = MODE_WEIGHTS.balanced;

// 成本未知（base_cost 缺失或为 0）时给中性分，避免「没回填成本的渠道看起来最便宜」。
const NEUTRAL_COST_SCORE = 50;

/** 换算规则与后台显示共用 routing.js 的实现，不允许两处各写一份汇率。 */
function costInUsd(channel) {
  const config = channel.cost_config || {};
  return costUsdToNumber({ baseCost: config.base_cost, currency: config.currency });
}

function normalizeWeights(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const out = {};
  for (const key of Object.keys(DEFAULT_WEIGHTS)) {
    const value = Number(source[key]);
    out[key] = Number.isFinite(value) && value >= 0 ? value : DEFAULT_WEIGHTS[key];
  }
  const total = Object.values(out).reduce((a, b) => a + b, 0);
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v / total]));
}

function unsupportedParameters(channel, parameters) {
  const blocked = channel?.capabilities?.unsupported_parameters;
  if (!Array.isArray(blocked) || blocked.length === 0) return [];
  const keys = new Set(Object.keys(parameters || {}));
  return blocked.filter((name) => keys.has(String(name)));
}

/**
 * routing_policies.failover_enabled 的读取口。换渠道重试之前必须先问它，
 * 否则后台的「故障转移」开关只写库不改行为，等于给管理员一个假按钮。
 */
export async function isFailoverEnabled(modelId, transaction = null) {
  if (!modelId) return true;
  const policy = await getRoutingPolicy(modelId, transaction);
  return policy?.failover_enabled !== false;
}

/**
 * 智能路由决策引擎。
 * 核心铁律：严格禁止跨模型降级。候选渠道只能来自同一个 Canonical Model 的多个供应商，
 * 故障转移（excludedProviderIds）也只在这批同模型渠道之间进行。
 */
export async function routeGenerationTask({
  jobId = null,
  modelId,
  parameters = {},
  excludedProviderIds = [],
  transaction = null,
  resolveCredential = getServerProviderApiKey,
  inflightCounts = null,
  log = true,
} = {}) {
  if (!modelId) throw new Error('路由目标 modelId 不能为空');

  const model = await getCanonicalModelById(modelId, transaction);
  if (!model) {
    throw Object.assign(new Error(`标准目录中不存在模型 ${modelId}`), { code: 'MODEL_NOT_FOUND' });
  }
  if (model.status === 'maintenance') {
    throw Object.assign(new Error(`模型 ${modelId} 维护中`), { code: 'MODEL_MAINTENANCE', retryable: true });
  }
  if (model.status === 'disabled') {
    throw Object.assign(new Error(`模型 ${modelId} 已停用`), { code: 'MODEL_DISABLED' });
  }

  const allProviderModels = await listProviderModelsByModelId(modelId, { enabledOnly: true });
  if (!allProviderModels?.length) {
    throw Object.assign(new Error(`模型 ${modelId} 暂无可用供应商渠道`), { code: 'NO_ACTIVE_PROVIDERS' });
  }

  const policy = (await getRoutingPolicy(modelId, transaction)) || {};
  const mode = MODE_WEIGHTS[policy.routing_mode] ? policy.routing_mode : ROUTING_MODES.BALANCED;
  const weights = normalizeWeights(policy.weights);
  const excluded = new Set(excludedProviderIds.map((p) => String(p).toLowerCase()));
  // 关闭故障转移的模型不允许「换一家重试」。在路由器里兜底，任何调用方都绕不过策略开关。
  if (policy.failover_enabled === false && excluded.size > 0) {
    throw Object.assign(new Error(`模型 ${modelId} 已关闭故障转移，不再切换其他供应商重试`), { code: 'FAILOVER_DISABLED' });
  }
  const inflight = inflightCounts || await countInflightAttemptsByProvider(transaction);

  const candidates = [];
  const rejected = [];
  const push = (channel, reason) => rejected.push({ providerId: channel.provider_id, providerModelId: channel.provider_model_id, reason });

  for (const channel of allProviderModels) {
    const key = String(channel.provider_id).toLowerCase();
    // 故障转移：本轮已经试过并失败的渠道，同模型内换下一家。
    if (excluded.has(key)) { push(channel, 'ALREADY_ATTEMPTED_FAILED'); continue; }
    // 没有 Adapter 的渠道不可调用，绝不能因为目录里存在它就以为能直连。
    if (!hasProviderAdapter(channel.provider_id)) { push(channel, 'ADAPTER_NOT_IMPLEMENTED'); continue; }
    if (channel.circuit_state === 'open' || channel.circuit_state === 'circuit_open') { push(channel, 'CIRCUIT_OPEN'); continue; }
    if (channel.health_status === 'disabled' || channel.health_status === 'unhealthy') {
      push(channel, `UNHEALTHY (${channel.health_status})`);
      continue;
    }
    // 无凭据是硬过滤：不把流量导向一个调不通的直连通道，也不借用别家密钥。
    if (!await resolveCredential({ provider: channel.provider_id })) { push(channel, 'PROVIDER_NOT_CONFIGURED'); continue; }
    if (Number(channel.provider_balance || 0) < 0 && channel.provider_type === 'official') {
      push(channel, 'INSUFFICIENT_BALANCE');
      continue;
    }
    const blocked = unsupportedParameters(channel, parameters);
    if (blocked.length) { push(channel, `PARAM_UNSUPPORTED (${blocked.join(',')})`); continue; }
    const limit = Number(channel.concurrency_limit || 0);
    if (limit > 0 && inflight.get(channel.provider_id) >= limit) { push(channel, 'CAPACITY_FULL'); continue; }
    candidates.push(channel);
  }

  if (!candidates.length) {
    const detail = rejected.map((r) => `${r.providerId}:${r.reason}`).join('; ');
    // 唯一的阻塞原因是「并发满了」时是排队问题，不是失败：上抛 retryable 让 worker 稍后重试。
    const onlyCapacity = rejected.length > 0 && rejected.every((r) => r.reason === 'CAPACITY_FULL');
    throw Object.assign(
      new Error(`模型 ${modelId} 所有备选渠道均不可用 (${detail})`),
      {
        code: onlyCapacity ? 'CHANNEL_CAPACITY_FULL' : 'ALL_PROVIDERS_UNAVAILABLE',
        retryable: onlyCapacity || undefined,
        details: rejected,
      },
    );
  }

  const costs = candidates.map(costInUsd).filter((v) => v !== null);
  const minCost = costs.length ? Math.min(...costs) : 0;
  const maxCost = costs.length ? Math.max(...costs) : 0;

  const scored = candidates.map((channel) => {
    const cost = costInUsd(channel);
    const costScore = cost === null || maxCost === minCost
      ? (cost === null ? NEUTRAL_COST_SCORE : 100)
      : Math.round(100 * (1 - (cost - minCost) / (maxCost - minCost)));

    let stabilityScore = 80;
    if (channel.health_status === 'healthy') stabilityScore += 15;
    if (channel.circuit_state === 'closed') stabilityScore += 5;
    if (channel.provider_type === 'official') stabilityScore += 5;
    stabilityScore = Math.min(100, stabilityScore);

    // 速度/容量两项在 Phase 07 接真实遥测前仍是启发式，权重由后台配置。
    const speedScore = channel.provider_type === 'official' ? 90 : 80;
    const limit = Number(channel.concurrency_limit || 0);
    const used = limit > 0 ? Math.min(1, (inflight.get(channel.provider_id) || 0) / limit) : 0;
    const capacityScore = limit > 0 ? Math.round(100 * (1 - used)) : 100;

    const totalScore =
      costScore * weights.cost +
      stabilityScore * weights.success_rate +
      speedScore * weights.speed +
      capacityScore * weights.capacity +
      (Number(channel.priority || 100) - 100) * 0.1;

    return {
      channel,
      providerId: channel.provider_id,
      providerModelId: channel.provider_model_id,
      costUsd: cost,
      costScore,
      stabilityScore,
      speedScore,
      capacityScore,
      totalScore: Number(totalScore.toFixed(2)),
    };
  });

  scored.sort((a, b) => b.totalScore - a.totalScore || String(a.providerId).localeCompare(String(b.providerId)));
  // 后台钉选的主渠道排在评分之前：管理员显式选定的供应商必须真的承载流量，
  // 否则「切换供应商」只改数据库不改行为。钉选渠道仍需通过上面的硬过滤。
  const pinnedIndex = scored.findIndex((item) => isPrimaryChannel(item.channel));
  if (pinnedIndex > 0) {
    const [pinned] = scored.splice(pinnedIndex, 1);
    scored.unshift(pinned);
  }
  const winner = scored[0];
  const selectionReason = `${pinnedIndex > 0 ? '钉选渠道; ' : ''}模式: ${mode}; 首选渠道: ${winner.providerId} (${winner.providerModelId}), 得分: ${winner.totalScore} (成本:${winner.costScore}, 稳定:${winner.stabilityScore}, 速度:${winner.speedScore}, 容量:${winner.capacityScore})`;

  // 路由日志是诊断信息，不属于任务事务的一部分：在外键失败时它会连累整个事务中止。
  if (log && jobId && !transaction) {
    await insertRouteDecision({
      jobId,
      modelId,
      candidates: scored,
      selectedProviderId: winner.providerId,
      selectedProviderModelId: winner.providerModelId,
      routingMode: mode,
      weights,
      score: winner.totalScore,
      costScore: winner.costScore,
      stabilityScore: winner.stabilityScore,
      speedScore: winner.speedScore,
      capacityScore: winner.capacityScore,
      selectionReason,
    }).catch((err) => console.error('[smartRouter/logDecision]', err.message));
  }

  return {
    selected: winner.channel,
    winner,
    candidates: scored,
    rejected,
    modelId,
    routingMode: mode,
    weights,
    failoverEnabled: policy.failover_enabled !== false,
    selectionReason,
    // 兼容既有探针/后台读取的字段名。
    selectedProviderId: winner.providerId,
    selectedProviderModelId: winner.providerModelId,
    selectedRoute: winner.channel,
    allCandidates: scored,
    finalScore: winner.totalScore,
  };
}
