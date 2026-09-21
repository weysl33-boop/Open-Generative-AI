import 'server-only';

import { PRIMARY_METADATA_KEY } from '../modelCenter/routing.js';
import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';

// ============================================================================
// 1. AI 供应商 (AI Providers)
// ============================================================================

export async function listProviders() {
  return queryMany(`
    SELECT id, slug, name, provider_type, enabled, priority, base_url, api_mode,
           health_status, last_health_check_at, balance, currency, circuit_state,
           circuit_opened_at, consecutive_failures, metadata, created_at, updated_at
    FROM ai_studio.ai_providers
    ORDER BY priority DESC, id ASC
  `);
}

export async function getProviderById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT id, slug, name, provider_type, enabled, priority, base_url, api_mode,
           health_status, last_health_check_at, balance, currency, circuit_state,
           circuit_opened_at, consecutive_failures, metadata, created_at, updated_at
    FROM ai_studio.ai_providers
    WHERE id = $1 OR slug = $1
  `, [id]);
}

// ai_providers.api_mode 的 CHECK 只接受这三个值；写入其他值会直接 23514 约束报错。
const API_MODES = new Set(['async', 'sync', 'stream']);

export function normalizeApiMode(value, fallback = 'async') {
  const mode = String(value ?? '').trim().toLowerCase();
  return API_MODES.has(mode) ? mode : fallback;
}

export async function createProvider(providerData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = String(providerData.id || `prv_${randomId()}`).trim().toLowerCase();
  const slug = String(providerData.slug || id).trim().toLowerCase();

  await run(`
    INSERT INTO ai_studio.ai_providers
      (id, slug, name, provider_type, enabled, priority, base_url, api_mode,
       balance, currency, health_status, circuit_state, metadata, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'healthy', 'closed', $11::jsonb, $12, $12)
  `, [
    id, slug, providerData.name || id, providerData.provider_type || 'aggregator',
    providerData.enabled !== false, Number(providerData.priority || 100),
    providerData.base_url || '', normalizeApiMode(providerData.api_mode),
    Number(providerData.balance || 0), providerData.currency || 'USD',
    JSON.stringify(providerData.metadata || {}), now,
  ]);

  return getProviderById(id, transaction);
}

export async function deleteProvider(id, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run('DELETE FROM ai_studio.ai_providers WHERE id = $1', [id]);
}

export async function updateProvider(id, updates, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const existing = await getProviderById(id, transaction);
  if (!existing) return null;

  const name = updates.name !== undefined ? updates.name : existing.name;
  const provider_type = updates.provider_type !== undefined ? updates.provider_type : existing.provider_type;
  const enabled = updates.enabled !== undefined ? Boolean(updates.enabled) : existing.enabled;
  const priority = updates.priority !== undefined ? Number(updates.priority) : existing.priority;
  const base_url = updates.base_url !== undefined ? updates.base_url : existing.base_url;
  const api_mode = updates.api_mode !== undefined ? normalizeApiMode(updates.api_mode, existing.api_mode) : existing.api_mode;
  const balance = updates.balance !== undefined ? Number(updates.balance) : existing.balance;
  const currency = updates.currency !== undefined ? updates.currency : existing.currency;
  
  let metadata = existing.metadata || {};
  if (updates.metadata !== undefined) {
    metadata = typeof updates.metadata === 'object' ? { ...metadata, ...updates.metadata } : metadata;
  }

  const now = nowIso();
  await run(`
    UPDATE ai_studio.ai_providers
    SET name = $1, provider_type = $2, enabled = $3, priority = $4, base_url = $5,
        api_mode = $6, balance = $7, currency = $8, metadata = $9::jsonb, updated_at = $10
    WHERE id = $11
  `, [name, provider_type, enabled, priority, base_url, api_mode, balance, currency, JSON.stringify(metadata), now, existing.id]);

  return getProviderById(existing.id, transaction);
}

/**
 * 落一次主动探测的结果。
 *
 * latencyMs 以前被签名收下却从未写库，探测到的延迟就此丢失，页面只能拿
 * 24h 生成记录的均值冒充「最近一次探测耗时」。现在连同 probe_kind 一起写进
 * metadata.last_probe：'credential' 只代表凭据配没配齐，不代表上游连通，
 * 两者混成一个数字会让管理员把待办看成已验证。
 */
export async function updateProviderHealth(
  id,
  { healthStatus, latencyMs = null, balance = null, probeKind = null },
  transaction = null,
) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const setClauses = ['health_status = $1', 'last_health_check_at = $2', 'updated_at = $2'];
  const params = [healthStatus, now];
  let paramIdx = 2;

  if (balance !== null && Number.isFinite(Number(balance))) {
    setClauses.push(`balance = $${++paramIdx}`);
    params.push(Number(balance));
  }

  // Number(null) === 0：不显式挡住 null，"这次没测到延迟"会被写成 0ms 的实测值。
  const latency = latencyMs === null || !Number.isFinite(Number(latencyMs)) || Number(latencyMs) < 0
    ? null
    : Math.round(Number(latencyMs));
  // jsonb 顶层合并：整块替换 last_probe，不动 metadata 里渠道映射等其它键。
  setClauses.push(`metadata = metadata || $${++paramIdx}::jsonb`);
  params.push(JSON.stringify({
    last_probe: { probed_at: now, latency_ms: latency, probe_kind: probeKind },
  }));

  params.push(id);

  await run(`
    UPDATE ai_studio.ai_providers
    SET ${setClauses.join(', ')}
    WHERE id = $${++paramIdx} OR slug = $${paramIdx}
  `, params);
}

// ai_providers.circuit_state 的合法取值；写错一个字母就会让整条失败上报链路 500。
const CIRCUIT_STATES = new Set(['closed', 'circuit_open', 'half_open']);

export async function updateProviderCircuitState(id, { circuitState, circuitOpenedAt = null, consecutiveFailures = 0 }, transaction = null) {
  if (!CIRCUIT_STATES.has(circuitState)) {
    throw new Error(`非法熔断状态 '${circuitState}'，仅允许 ${[...CIRCUIT_STATES].join(' / ')}`);
  }
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  await run(`
    UPDATE ai_studio.ai_providers
    SET circuit_state = $1, circuit_opened_at = $2, consecutive_failures = $3, updated_at = $4
    WHERE id = $5 OR slug = $5
  `, [circuitState, circuitOpenedAt, consecutiveFailures, now, id]);
}

// ============================================================================
// 2. 标准模型目录 (Canonical AI Models)
// ============================================================================

export async function listCanonicalModels({ category = null, activeOnly = false } = {}) {
  const clauses = ['1=1'];
  const params = [];
  let paramIdx = 0;

  if (category) {
    clauses.push(`category = $${++paramIdx}`);
    params.push(category);
  }
  if (activeOnly) {
    clauses.push(`status = 'active'`);
  }

  return queryMany(`
    SELECT id, slug, name, display_name, category, description, cover, status,
           sort, is_featured, capabilities, default_parameters, supported_resolutions,
           supported_durations, supported_ratios, supported_input_types, supported_output_types,
           created_at, updated_at
    FROM ai_studio.ai_models
    WHERE ${clauses.join(' AND ')}
    ORDER BY sort ASC, created_at ASC
  `, params);
}

export async function getCanonicalModelById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT id, slug, name, display_name, category, description, cover, status,
           sort, is_featured, capabilities, default_parameters, supported_resolutions,
           supported_durations, supported_ratios, supported_input_types, supported_output_types,
           created_at, updated_at
    FROM ai_studio.ai_models
    WHERE id = $1 OR slug = $1
  `, [id]);
}

export async function upsertCanonicalModel(modelData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = String(modelData.id).trim();
  const slug = String(modelData.slug || id).trim();

  await run(`
    INSERT INTO ai_studio.ai_models
      (id, slug, name, display_name, category, description, cover, status, sort, is_featured,
       capabilities, default_parameters, supported_resolutions, supported_durations,
       supported_ratios, supported_input_types, supported_output_types, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11::jsonb, $12::jsonb, $13::jsonb, $14::jsonb, $15::jsonb, $16::jsonb, $17::jsonb, $18, $18)
    ON CONFLICT (id) DO UPDATE SET
      name = EXCLUDED.name,
      display_name = EXCLUDED.display_name,
      category = EXCLUDED.category,
      description = EXCLUDED.description,
      cover = EXCLUDED.cover,
      status = EXCLUDED.status,
      sort = EXCLUDED.sort,
      is_featured = EXCLUDED.is_featured,
      capabilities = EXCLUDED.capabilities,
      default_parameters = EXCLUDED.default_parameters,
      supported_resolutions = EXCLUDED.supported_resolutions,
      supported_durations = EXCLUDED.supported_durations,
      supported_ratios = EXCLUDED.supported_ratios,
      supported_input_types = EXCLUDED.supported_input_types,
      supported_output_types = EXCLUDED.supported_output_types,
      updated_at = EXCLUDED.updated_at
  `, [
    id, slug, modelData.name, modelData.display_name || modelData.name,
    modelData.category || 'image', modelData.description || '', modelData.cover || '',
    modelData.status || 'active', Number(modelData.sort || 0), Boolean(modelData.is_featured),
    JSON.stringify(modelData.capabilities || {}),
    JSON.stringify(modelData.default_parameters || {}),
    JSON.stringify(modelData.supported_resolutions || []),
    JSON.stringify(modelData.supported_durations || []),
    JSON.stringify(modelData.supported_ratios || []),
    JSON.stringify(modelData.supported_input_types || []),
    JSON.stringify(modelData.supported_output_types || []),
    now,
  ]);

  return getCanonicalModelById(id, transaction);
}

// ============================================================================
// 3. 供应商模型渠道 (Provider Models)
// ============================================================================

export async function listProviderModelsByModelId(modelId, { enabledOnly = false } = {}) {
  const clauses = ['pm.model_id = $1'];
  if (enabledOnly) clauses.push('pm.enabled = TRUE', 'p.enabled = TRUE');

  return queryMany(`
    SELECT pm.id, pm.model_id, pm.provider_id, pm.provider_model_id, pm.enabled,
           pm.priority, pm.cost_config, pm.parameter_mapping, pm.capabilities,
           pm.endpoint_config, pm.timeout, pm.max_retries, pm.supports_webhook,
           pm.supports_polling, pm.concurrency_limit, pm.rate_limit, pm.metadata,
           pm.created_at, pm.updated_at,
           p.name AS provider_name, p.provider_type, p.base_url, p.health_status,
           p.circuit_state, p.balance AS provider_balance, p.currency AS provider_currency
    FROM ai_studio.provider_models pm
    JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    WHERE ${clauses.join(' AND ')}
    ORDER BY pm.priority DESC, pm.id ASC
  `, [modelId]);
}

export async function getProviderModelById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run(`
    SELECT pm.*, p.name AS provider_name, p.provider_type, p.base_url, p.health_status, p.circuit_state
    FROM ai_studio.provider_models pm
    JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
    WHERE pm.id = $1
  `, [id]);
}

function providedEntries(patchable) {
  return Object.entries(patchable).filter(([, value]) => value !== undefined);
}

export async function upsertProviderModel(pmData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = pmData.id || `pm_${randomId()}`;

  // PATCH 语义：只写调用方真正提交的列。
  // 之前 ON CONFLICT 直接取 EXCLUDED.*，调用方只提交 6 个字段时，
  // cost_config / timeout / max_retries / concurrency_limit / rate_limit / metadata
  // 会被静默重置为默认值 —— 后台拨一下渠道开关就会清空它的成本与重试配置。
  // 不用 COALESCE + EXCLUDED 是因为默认值会在 VALUES 阶段被填进 EXCLUDED，无法区分。
  const patchable = {
    model_id: pmData.model_id,
    provider_id: pmData.provider_id,
    provider_model_id: pmData.provider_model_id,
    enabled: pmData.enabled === undefined ? undefined : Boolean(pmData.enabled),
    priority: pmData.priority === undefined ? undefined : Number(pmData.priority),
    cost_config: pmData.cost_config,
    parameter_mapping: pmData.parameter_mapping,
    capabilities: pmData.capabilities,
    endpoint_config: pmData.endpoint_config,
    timeout: pmData.timeout === undefined ? undefined : Number(pmData.timeout),
    max_retries: pmData.max_retries === undefined ? undefined : Number(pmData.max_retries),
    supports_webhook: pmData.supports_webhook === undefined ? undefined : Boolean(pmData.supports_webhook),
    supports_polling: pmData.supports_polling === undefined ? undefined : Boolean(pmData.supports_polling),
    concurrency_limit: pmData.concurrency_limit === undefined ? undefined : Number(pmData.concurrency_limit),
    rate_limit: pmData.rate_limit === undefined ? undefined : Number(pmData.rate_limit),
    metadata: pmData.metadata,
  };
  const provided = providedEntries(patchable);

  const setClauses = provided.map(([key], i) => `${key} = $${i + 1}`);
  if (setClauses.length) {
    const valueCount = provided.length;
    setClauses.push(`updated_at = $${valueCount + 1}`);
    const changed = await run(`
      UPDATE ai_studio.provider_models
      SET ${setClauses.join(', ')}
      WHERE id = $${valueCount + 2}
    `, [...provided.map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : v)), now, id]);
    if (changed) return getProviderModelById(id, transaction);
  }

  const col = (key, fallback) => {
    const [_, v] = provided.find(([k]) => k === key) || [];
    return v === undefined ? fallback : v;
  };
  const jsonCol = (key, fallback) => JSON.stringify(col(key, fallback));

  await run(`
    INSERT INTO ai_studio.provider_models
      (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config,
       parameter_mapping, capabilities, endpoint_config, timeout, max_retries,
       supports_webhook, supports_polling, concurrency_limit, rate_limit, metadata, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $18)
    ON CONFLICT (id) DO NOTHING
  `, [
    id,
    col('model_id', null),
    col('provider_id', null),
    col('provider_model_id', null),
    col('enabled', true),
    col('priority', 100),
    jsonCol('cost_config', { currency: 'USD', base_cost: 0 }),
    jsonCol('parameter_mapping', {}),
    jsonCol('capabilities', {}),
    jsonCol('endpoint_config', {}),
    col('timeout', 120000),
    col('max_retries', 2),
    col('supports_webhook', false),
    col('supports_polling', true),
    col('concurrency_limit', 10),
    col('rate_limit', 60),
    jsonCol('metadata', {}),
    now,
  ]);

  return getProviderModelById(id, transaction);
}

export async function deleteProviderModel(id, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run('DELETE FROM ai_studio.provider_models WHERE id = $1', [id]);
}

/**
 * 主选钉选：一个模型下同时只允许一条渠道带 primary 标记。
 * 两条 UPDATE 必须在同一事务里，否则会留下两个「首选」，后台显示一家、
 * 路由器选另一家。返回 0 表示渠道不存在，调用方据此拒绝切换。
 */
export async function setChannelPrimary(modelId, channelId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const applied = await run(`
    UPDATE ai_studio.provider_models
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{${PRIMARY_METADATA_KEY}}', 'true'::jsonb),
        updated_at = $2
    WHERE id = $1
  `, [channelId, now]);
  if (!applied) return 0;

  await run(`
    UPDATE ai_studio.provider_models
    SET metadata = jsonb_set(COALESCE(metadata, '{}'::jsonb), '{${PRIMARY_METADATA_KEY}}', 'false'::jsonb),
        updated_at = $3
    WHERE LOWER(model_id) = LOWER($1) AND id <> $2
      AND COALESCE(metadata ->> '${PRIMARY_METADATA_KEY}', 'false') <> 'false'
  `, [modelId, channelId, now]);
  return applied;
}

// ============================================================================
// 4. 定价与路由策略 (Pricing & Routing Policies)
// ============================================================================

export async function getModelPricing(modelId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run('SELECT * FROM ai_studio.model_pricing WHERE model_id = $1', [modelId]);
}

export async function listCanonicalPricingRows() {
  return queryMany(`
    SELECT mp.*, m.name, m.display_name, m.category, m.status AS model_status
    FROM ai_studio.model_pricing mp
    JOIN ai_studio.ai_models m ON m.id = mp.model_id
    ORDER BY m.sort ASC, m.id ASC
  `);
}

export async function upsertModelPricing(pricingData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = pricingData.id || `prc_${randomId()}`;

  // PATCH 语义：未提交的列保留原值，避免部分保存把订阅折扣矩阵清空。
  const patchable = {
    pricing_type: pricingData.pricing_type,
    base_credits: pricingData.base_credits === undefined ? undefined : Number(pricingData.base_credits),
    formula_config: pricingData.formula_config,
    subscription_discounts: pricingData.subscription_discounts,
    min_credits: pricingData.min_credits === undefined ? undefined : Number(pricingData.min_credits),
    min_gross_margin_rate: pricingData.min_gross_margin_rate === undefined ? undefined : Number(pricingData.min_gross_margin_rate),
    is_active: pricingData.is_active === undefined ? undefined : Boolean(pricingData.is_active),
  };
  const provided = providedEntries(patchable);

  if (provided.length) {
    const setClauses = provided.map(([key], i) => `${key} = $${i + 1}`);
    setClauses.push(`updated_at = $${provided.length + 1}`);
    const changed = await run(`
      UPDATE ai_studio.model_pricing
      SET ${setClauses.join(', ')}
      WHERE model_id = $${provided.length + 2}
    `, [...provided.map(([, v]) => (typeof v === 'object' ? JSON.stringify(v) : v)), now, pricingData.model_id]);
    if (changed) return getModelPricing(pricingData.model_id, transaction);
  }

  const col = (key, fallback) => {
    const entry = provided.find(([k]) => k === key);
    return entry ? entry[1] : fallback;
  };

  await run(`
    INSERT INTO ai_studio.model_pricing
      (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts,
       min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $10)
    ON CONFLICT (model_id) DO NOTHING
  `, [
    id, pricingData.model_id,
    col('pricing_type', 'fixed'),
    col('base_credits', 100),
    JSON.stringify(col('formula_config', {})),
    JSON.stringify(col('subscription_discounts', {})),
    col('min_credits', 10),
    col('min_gross_margin_rate', 0.3),
    col('is_active', true),
    now,
  ]);

  return getModelPricing(pricingData.model_id, transaction);
}

export async function getRoutingPolicy(modelId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run('SELECT * FROM ai_studio.routing_policies WHERE model_id = $1', [modelId]);
}

export async function upsertRoutingPolicy(policyData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = policyData.id || `rp_${randomId()}`;

  // PATCH 语义：只写调用方真正提交的列。
  // 路由编辑页提交 routing_mode / weights / failover_enabled 时不带 circuit_breaker_config，
  // 旧的 ON CONFLICT DO UPDATE 会把熔断阈值重置为默认值 —— 后台每存一次路由就抹掉一次熔断配置。
  const patchable = {
    routing_mode: policyData.routing_mode,
    weights: policyData.weights === undefined ? undefined : JSON.stringify(policyData.weights),
    circuit_breaker_config: policyData.circuit_breaker_config === undefined
      ? undefined
      : JSON.stringify(policyData.circuit_breaker_config),
    failover_enabled: policyData.failover_enabled === undefined
      ? undefined
      : policyData.failover_enabled !== false,
  };
  const jsonColumns = new Set(['weights', 'circuit_breaker_config']);
  const provided = providedEntries(patchable);

  const setClauses = provided.map(([key], i) => `${key} = $${i + 1}${jsonColumns.has(key) ? '::jsonb' : ''}`);
  if (setClauses.length) {
    const valueCount = provided.length;
    setClauses.push(`updated_at = $${valueCount + 1}`);
    const changed = await run(`
      UPDATE ai_studio.routing_policies
      SET ${setClauses.join(', ')}
      WHERE model_id = $${valueCount + 2}
    `, [...provided.map(([, value]) => value), now, policyData.model_id]);
    if (changed) return getRoutingPolicy(policyData.model_id, transaction);
  }

  const col = (key, fallback) => {
    const entry = provided.find(([k]) => k === key);
    return entry ? entry[1] : fallback;
  };

  await run(`
    INSERT INTO ai_studio.routing_policies
      (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $7)
    ON CONFLICT (model_id) DO NOTHING
  `, [
    id, policyData.model_id,
    col('routing_mode', 'balanced'),
    col('weights', JSON.stringify({ cost: 0.4, success_rate: 0.3, speed: 0.2, capacity: 0.1 })),
    col('circuit_breaker_config', JSON.stringify({ failure_threshold: 3, cooling_period_sec: 60, half_open_requests: 2 })),
    col('failover_enabled', true),
    now,
  ]);

  return getRoutingPolicy(policyData.model_id, transaction);
}
