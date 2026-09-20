import 'server-only';

import { query, queryOne, queryMany, execute, nowIso } from '../db/index.js';
import { getProviderById, updateProviderCircuitState, updateProviderHealth } from '../repositories/aiCatalog.js';
import { getProviderAdapter } from '../adapters/index.js';

const DEFAULT_FAILURE_THRESHOLD = 5;
const DEFAULT_COOLING_PERIOD_SEC = 60;

/**
 * 记录渠道调用成功
 * 如果处于半开状态，恢复为闭合 (closed)，并清空连续失败计数
 */
export async function recordProviderSuccess(providerId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  await run(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = 'closed',
        consecutive_failures = 0,
        circuit_opened_at = NULL,
        health_status = CASE WHEN health_status = 'unhealthy' THEN 'degraded' ELSE health_status END,
        updated_at = $1
    WHERE id = $2 OR slug = $2
  `, [now, providerId]);
}

/**
 * 记录渠道调用失败
 * 累加失败次数，若达到阈值则触发熔断 (open)
 */
export async function recordProviderFailure(providerId, { failureThreshold = DEFAULT_FAILURE_THRESHOLD } = {}, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const qOne = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const now = nowIso();

  const provider = await qOne(`
    SELECT id, consecutive_failures, circuit_state
    FROM ai_studio.ai_providers
    WHERE id = $1 OR slug = $1
  `, [providerId]);

  if (!provider) return;

  const newFailures = (provider.consecutive_failures || 0) + 1;
  const shouldTrip = newFailures >= failureThreshold;

  await run(`
    UPDATE ai_studio.ai_providers
    SET consecutive_failures = $1,
        circuit_state = CASE WHEN $2 THEN 'open' ELSE circuit_state END,
        circuit_opened_at = CASE WHEN $2 AND circuit_state != 'open' THEN $3 ELSE circuit_opened_at END,
        health_status = CASE WHEN $2 THEN 'unhealthy' ELSE health_status END,
        updated_at = $3
    WHERE id = $4
  `, [newFailures, shouldTrip, now, provider.id]);

  return { tripped: shouldTrip, consecutiveFailures: newFailures };
}

/**
 * 重置熔断器状态
 */
export async function resetProviderCircuit(providerId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  await run(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = 'closed',
        consecutive_failures = 0,
        circuit_opened_at = NULL,
        health_status = 'healthy',
        updated_at = $1
    WHERE id = $2 OR slug = $2
  `, [now, providerId]);

  return { success: true, providerId, circuit_state: 'closed' };
}

/**
 * 检查并尝试进入半开试验状态
 */
export async function checkAndHalfOpenProvider(providerId, coolingPeriodSec = DEFAULT_COOLING_PERIOD_SEC, transaction = null) {
  const qOne = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();

  const provider = await qOne(`
    SELECT id, circuit_state, circuit_opened_at
    FROM ai_studio.ai_providers
    WHERE id = $1 OR slug = $1
  `, [providerId]);

  if (!provider || provider.circuit_state !== 'open' || !provider.circuit_opened_at) return false;

  const openedTime = new Date(provider.circuit_opened_at).getTime();
  const elapsedSec = (Date.now() - openedTime) / 1000;

  if (elapsedSec >= coolingPeriodSec) {
    await run(`
      UPDATE ai_studio.ai_providers
      SET circuit_state = 'half_open', updated_at = $1
      WHERE id = $2
    `, [now, provider.id]);
    return true;
  }
  return false;
}

/**
 * 获取所有渠道的实时健康状态与熔断监控指标
 */
export async function getChannelsHealthOverview() {
  const providers = await queryMany(`
    SELECT p.id, p.slug, p.name, p.provider_type, p.enabled, p.priority,
           p.health_status, p.circuit_state, p.circuit_opened_at, p.consecutive_failures,
           p.last_health_check_at, p.base_url, p.balance, p.currency,
           COUNT(pm.id) AS bound_models_count,
           COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_attempts_24h,
           COALESCE(COUNT(att.id), 0) AS total_attempts_24h,
           COALESCE(ROUND(AVG(att.duration_ms)), 0) AS avg_latency_ms_24h
    FROM ai_studio.ai_providers p
    LEFT JOIN ai_studio.provider_models pm ON pm.provider_id = p.id
    LEFT JOIN ai_studio.generation_attempts att ON att.provider_id = p.id AND att.created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY p.id
    ORDER BY p.priority DESC, p.id ASC
  `);

  return providers.map((row) => {
    const total = Number(row.total_attempts_24h || 0);
    const success = Number(row.success_attempts_24h || 0);
    const successRate = total > 0 ? Number(((success / total) * 100).toFixed(1)) : 100;

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
      avgLatencyMs24h: Number(row.avg_latency_ms_24h || 0),
    };
  });
}

/**
 * 对指定供应商执行主动探测
 */
export async function probeProviderChannel(providerId) {
  const start = Date.now();
  try {
    const adapter = await getProviderAdapter(providerId);
    const probeResult = await adapter.healthCheck();
    const latencyMs = probeResult.latencyMs || (Date.now() - start);
    const healthStatus = probeResult.status === 'healthy' ? 'healthy' : 'degraded';

    await updateProviderHealth(providerId, {
      healthStatus,
      latencyMs,
      balance: probeResult.balance ?? null,
    });

    return {
      success: true,
      providerId,
      healthStatus,
      latencyMs,
      message: probeResult.message || '健康探针响应正常',
      details: probeResult,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    await updateProviderHealth(providerId, {
      healthStatus: 'unhealthy',
      latencyMs,
    });

    return {
      success: false,
      providerId,
      healthStatus: 'unhealthy',
      latencyMs,
      message: error.message || '健康探针连接失败',
      errorCode: error.code || 'PROBE_FAILED',
    };
  }
}
