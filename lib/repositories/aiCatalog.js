import 'server-only';

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
    providerData.base_url || '', providerData.api_mode || 'async_poll',
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
  const api_mode = updates.api_mode !== undefined ? updates.api_mode : existing.api_mode;
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

export async function updateProviderHealth(id, { healthStatus, latencyMs = null, balance = null }, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const setClauses = ['health_status = $1', 'last_health_check_at = $2', 'updated_at = $2'];
  const params = [healthStatus, now];
  let paramIdx = 2;

  if (balance !== null && Number.isFinite(Number(balance))) {
    setClauses.push(`balance = $${++paramIdx}`);
    params.push(Number(balance));
  }
  params.push(id);

  await run(`
    UPDATE ai_studio.ai_providers
    SET ${setClauses.join(', ')}
    WHERE id = $${++paramIdx} OR slug = $${paramIdx}
  `, params);
}

export async function updateProviderCircuitState(id, { circuitState, circuitOpenedAt = null, consecutiveFailures = 0 }, transaction = null) {
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

export async function upsertProviderModel(pmData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = pmData.id || `pm_${randomId()}`;

  await run(`
    INSERT INTO ai_studio.provider_models
      (id, model_id, provider_id, provider_model_id, enabled, priority, cost_config,
       parameter_mapping, capabilities, endpoint_config, timeout, max_retries,
       supports_webhook, supports_polling, concurrency_limit, rate_limit, metadata, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9::jsonb, $10::jsonb, $11, $12, $13, $14, $15, $16, $17::jsonb, $18, $18)
    ON CONFLICT (id) DO UPDATE SET
      model_id = EXCLUDED.model_id,
      provider_id = EXCLUDED.provider_id,
      provider_model_id = EXCLUDED.provider_model_id,
      enabled = EXCLUDED.enabled,
      priority = EXCLUDED.priority,
      cost_config = EXCLUDED.cost_config,
      parameter_mapping = EXCLUDED.parameter_mapping,
      capabilities = EXCLUDED.capabilities,
      endpoint_config = EXCLUDED.endpoint_config,
      timeout = EXCLUDED.timeout,
      max_retries = EXCLUDED.max_retries,
      supports_webhook = EXCLUDED.supports_webhook,
      supports_polling = EXCLUDED.supports_polling,
      concurrency_limit = EXCLUDED.concurrency_limit,
      rate_limit = EXCLUDED.rate_limit,
      metadata = EXCLUDED.metadata,
      updated_at = EXCLUDED.updated_at
  `, [
    id, pmData.model_id, pmData.provider_id, pmData.provider_model_id,
    pmData.enabled !== false, Number(pmData.priority || 100),
    JSON.stringify(pmData.cost_config || { currency: 'USD', base_cost: 0 }),
    JSON.stringify(pmData.parameter_mapping || {}),
    JSON.stringify(pmData.capabilities || {}),
    JSON.stringify(pmData.endpoint_config || {}),
    Number(pmData.timeout || 120000),
    Number(pmData.max_retries || 2),
    Boolean(pmData.supports_webhook),
    pmData.supports_polling !== false,
    Number(pmData.concurrency_limit || 10),
    Number(pmData.rate_limit || 60),
    JSON.stringify(pmData.metadata || {}),
    now,
  ]);

  return getProviderModelById(id, transaction);
}

export async function deleteProviderModel(id, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run('DELETE FROM ai_studio.provider_models WHERE id = $1', [id]);
}

// ============================================================================
// 4. 定价与路由策略 (Pricing & Routing Policies)
// ============================================================================

export async function getModelPricing(modelId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run('SELECT * FROM ai_studio.model_pricing WHERE model_id = $1', [modelId]);
}

export async function upsertModelPricing(pricingData, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const now = nowIso();
  const id = pricingData.id || `prc_${randomId()}`;

  await run(`
    INSERT INTO ai_studio.model_pricing
      (id, model_id, pricing_type, base_credits, formula_config, subscription_discounts,
       min_credits, min_gross_margin_rate, is_active, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7, $8, $9, $10, $10)
    ON CONFLICT (model_id) DO UPDATE SET
      pricing_type = EXCLUDED.pricing_type,
      base_credits = EXCLUDED.base_credits,
      formula_config = EXCLUDED.formula_config,
      subscription_discounts = EXCLUDED.subscription_discounts,
      min_credits = EXCLUDED.min_credits,
      min_gross_margin_rate = EXCLUDED.min_gross_margin_rate,
      is_active = EXCLUDED.is_active,
      updated_at = EXCLUDED.updated_at
  `, [
    id, pricingData.model_id, pricingData.pricing_type || 'fixed',
    Number(pricingData.base_credits || 100),
    JSON.stringify(pricingData.formula_config || {}),
    JSON.stringify(pricingData.subscription_discounts || {}),
    Number(pricingData.min_credits || 10),
    Number(pricingData.min_gross_margin_rate || 0.3),
    pricingData.is_active !== false,
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

  await run(`
    INSERT INTO ai_studio.routing_policies
      (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
    VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7, $7)
    ON CONFLICT (model_id) DO UPDATE SET
      routing_mode = EXCLUDED.routing_mode,
      weights = EXCLUDED.weights,
      circuit_breaker_config = EXCLUDED.circuit_breaker_config,
      failover_enabled = EXCLUDED.failover_enabled,
      updated_at = EXCLUDED.updated_at
  `, [
    id, policyData.model_id, policyData.routing_mode || 'balanced',
    JSON.stringify(policyData.weights || { cost: 0.4, success_rate: 0.3, speed: 0.2, capacity: 0.1 }),
    JSON.stringify(policyData.circuit_breaker_config || { failure_threshold: 3, cooling_period_sec: 60, half_open_requests: 2 }),
    policyData.failover_enabled !== false,
    now,
  ]);

  return getRoutingPolicy(policyData.model_id, transaction);
}
