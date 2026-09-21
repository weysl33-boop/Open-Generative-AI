import 'server-only';

import { nowIso } from '../db/index.js';
import * as circuitRepo from '../repositories/circuitBreaker.js';
import { toFiniteMs } from './probeContract.js';

export const CIRCUIT_STATE = Object.freeze({
  CLOSED: 'closed',
  OPEN: 'circuit_open',
  HALF_OPEN: 'half_open',
});

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLING_PERIOD_SEC = 60;

/**
 * 解析熔断阈值：管理员在 routing_policies.circuit_breaker_config 中的配置优先于内置默认。
 * 需求 §24「阈值后台可配置」——之前阈值只是常量，配置列被完全忽略。
 */
export async function resolveCircuitConfig(modelId = null, transaction = null) {
  if (!modelId) return { failureThreshold: DEFAULT_FAILURE_THRESHOLD, coolingPeriodSec: DEFAULT_COOLING_PERIOD_SEC, halfOpenRequests: 1 };
  const row = await circuitRepo.getRoutingCircuitConfig(modelId, transaction);
  const cfg = row?.circuit_breaker_config || {};
  const intOr = (value, fallback, min) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min ? Math.floor(n) : fallback;
  };
  return {
    failureThreshold: intOr(cfg.failure_threshold, DEFAULT_FAILURE_THRESHOLD, 1),
    coolingPeriodSec: intOr(cfg.cooling_period_sec, DEFAULT_COOLING_PERIOD_SEC, 1),
    halfOpenRequests: intOr(cfg.half_open_requests, 1, 1),
  };
}

/**
 * 记录渠道调用成功
 * 如果处于半开状态，恢复为闭合 (closed)，并清空连续失败计数
 */
export async function recordProviderSuccess(providerId, transaction = null) {
  await circuitRepo.closeProviderCircuit(providerId, nowIso(), transaction);
}

/**
 * 记录渠道调用失败
 * 累加失败次数，若达到阈值则触发熔断 (circuit_open)
 * 注意：'open' 不是 ai_providers.circuit_state 的合法取值，写入会直接违反 CHECK 约束。
 */
export async function recordProviderFailure(providerId, { failureThreshold = DEFAULT_FAILURE_THRESHOLD } = {}, transaction = null) {
  const now = nowIso();
  const provider = await circuitRepo.findProviderCircuitForUpdate(providerId, transaction);

  if (!provider) return;

  const newFailures = (provider.consecutive_failures || 0) + 1;
  const shouldTrip = newFailures >= failureThreshold;

  await circuitRepo.applyProviderFailure({
    providerId,
    providerRowId: provider.id,
    failures: newFailures,
    shouldTrip,
    timestamp: now,
  }, transaction);

  return { tripped: shouldTrip, consecutiveFailures: newFailures };
}

/**
 * 重置熔断器状态
 */
export async function resetProviderCircuit(providerId, transaction = null) {
  await circuitRepo.resetProviderCircuitState(providerId, nowIso(), transaction);

  return { success: true, providerId, circuit_state: CIRCUIT_STATE.CLOSED };
}

/**
 * 检查并尝试进入半开试验状态
 * 半开期间只放行少量试探请求，由 getHalfOpenQuota 读取剩余配额。
 */
export async function checkAndHalfOpenProvider(providerId, coolingPeriodSec = DEFAULT_COOLING_PERIOD_SEC, transaction = null) {
  const now = nowIso();
  const provider = await circuitRepo.getProviderCircuit(providerId, transaction);

  if (!provider || provider.circuit_state !== CIRCUIT_STATE.OPEN || !provider.circuit_opened_at) return false;

  const openedTime = new Date(provider.circuit_opened_at).getTime();
  const elapsedSec = (Date.now() - openedTime) / 1000;

  if (elapsedSec >= coolingPeriodSec) {
    await circuitRepo.markProviderHalfOpen(provider.id, now, transaction);
    return true;
  }
  return false;
}

/**
 * 获取所有渠道的实时健康状态与熔断监控指标
 */
export async function getChannelsHealthOverview() {
  const providers = await circuitRepo.listProviderHealthOverview();

  return providers.map((row) => {
    const total = Number(row.total_attempts_24h || 0);
    const success = Number(row.success_attempts_24h || 0);
    // 无样本时返回 null，而不是假的 100%——空表冒充满分会让管理员误判渠道健康。
    const successRate = total > 0 ? Number(((success / total) * 100).toFixed(1)) : null;

    return {
      id: row.id,
      slug: row.slug,
      name: row.name,
      providerType: row.provider_type,
      enabled: Boolean(row.enabled),
      priority: Number(row.priority),
      healthStatus: row.health_status || 'healthy',
      circuitState: row.circuit_state || 'closed',
      circuitOpenedAt: row.circuit_opened_at,
      consecutiveFailures: Number(row.consecutive_failures || 0),
      lastHealthCheckAt: row.last_health_check_at,
      baseUrl: row.base_url,
      balance: Number(row.balance || 0),
      currency: row.currency || 'USD',
      boundModelsCount: Number(row.bound_models_count || 0),
      totalAttempts24h: total,
      successAttempts24h: success,
      successRate24h: successRate,
      // 没有 24h 样本时延迟同样是 null：0 ms 会被读成"这个渠道飞快"，而不是"没数据"。
      avgLatencyMs24h: total > 0 && row.avg_latency_ms_24h !== null
        ? Number(row.avg_latency_ms_24h)
        : null,
      lastProbe: row.last_probe
        ? {
          probedAt: row.last_probe.probed_at ?? row.last_health_check_at ?? null,
          latencyMs: toFiniteMs(row.last_probe.latency_ms),
          probeKind: row.last_probe.probe_kind ?? null,
        }
        : null,
    };
  });
}
