import { execute, queryMany, queryOne } from '../db/index.js';

function one(transaction) {
  return transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
}

function many(transaction) {
  return transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
}

function write(transaction) {
  return transaction?.execute ? transaction.execute.bind(transaction) : execute;
}

export async function getRoutingCircuitConfig(modelId, transaction = null) {
  return one(transaction)('SELECT circuit_breaker_config FROM ai_studio.routing_policies WHERE model_id = $1', [modelId]);
}

export async function findProviderCircuitForUpdate(providerId, transaction = null) {
  return one(transaction)(`
    SELECT id, consecutive_failures, circuit_state
    FROM ai_studio.ai_providers
    WHERE id = $1 OR slug = $1
    FOR UPDATE
  `, [providerId]);
}

export async function applyProviderFailure({ providerId, providerRowId, failures, shouldTrip, timestamp }, transaction = null) {
  return write(transaction)(`
    UPDATE ai_studio.ai_providers
    SET consecutive_failures = $1,
        circuit_state = CASE WHEN $2 THEN 'circuit_open' ELSE circuit_state END,
        circuit_opened_at = CASE WHEN $2 AND circuit_state != 'circuit_open' THEN $3 ELSE circuit_opened_at END,
        health_status = CASE WHEN $2 THEN 'unhealthy' ELSE health_status END,
        updated_at = $3
    WHERE id = $4
  `, [failures, shouldTrip, timestamp, providerRowId || providerId]);
}

export async function closeProviderCircuit(providerId, timestamp, transaction = null) {
  return write(transaction)(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = 'closed', consecutive_failures = 0, circuit_opened_at = NULL,
        health_status = CASE WHEN health_status = 'unhealthy' THEN 'degraded' ELSE health_status END,
        updated_at = $1
    WHERE id = $2 OR slug = $2
  `, [timestamp, providerId]);
}

export async function resetProviderCircuitState(providerId, timestamp, transaction = null) {
  return write(transaction)(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = 'closed', consecutive_failures = 0, circuit_opened_at = NULL,
        health_status = 'healthy', updated_at = $1
    WHERE id = $2 OR slug = $2
  `, [timestamp, providerId]);
}

export async function getProviderCircuit(providerId, transaction = null) {
  return one(transaction)(`
    SELECT id, circuit_state, circuit_opened_at
    FROM ai_studio.ai_providers WHERE id = $1 OR slug = $1
  `, [providerId]);
}

export async function markProviderHalfOpen(providerId, timestamp, transaction = null) {
  return write(transaction)(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = 'half_open', updated_at = $1
    WHERE id = $2
  `, [timestamp, providerId]);
}

export async function listProviderHealthOverview() {
  return many()( `
    SELECT p.id, p.slug, p.name, p.provider_type, p.enabled, p.priority,
           p.health_status, p.circuit_state, p.circuit_opened_at, p.consecutive_failures,
           p.last_health_check_at, p.base_url, p.balance, p.currency,
           COUNT(pm.id) AS bound_models_count,
           COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_attempts_24h,
           COALESCE(COUNT(att.id), 0) AS total_attempts_24h,
           ROUND(AVG(att.duration_ms)) AS avg_latency_ms_24h,
           p.metadata -> 'last_probe' AS last_probe
    FROM ai_studio.ai_providers p
    LEFT JOIN ai_studio.provider_models pm ON pm.provider_id = p.id
    LEFT JOIN ai_studio.generation_attempts att ON att.provider_id = p.id AND att.created_at >= NOW() - INTERVAL '24 hours'
    GROUP BY p.id
    ORDER BY p.priority DESC, p.id ASC
  `);
}
