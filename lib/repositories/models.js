import { query, queryMany, queryOne, execute, nowIso } from '../db/index.js';
import { PRIMARY_METADATA_KEY } from '../modelCenter/routing.js';

export async function listAllModels() {
  const res = await query(`
    SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order, metadata_json, created_at, updated_at
    FROM models_config
    ORDER BY sort_order ASC, created_at ASC
  `);
  return res.rows;
}

export async function listActiveModels() {
  const res = await query(`
    SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order, metadata_json
    FROM models_config
    WHERE is_active = TRUE
    ORDER BY sort_order ASC, created_at ASC
  `);
  return res.rows;
}

const SUCCESS_STATUS_LIST = "'succeeded', 'completed', 'success'";

/**
 * Adapter 工厂实际登记的供应商标识（lib/adapters/index.js 的 ADAPTER_CLASSES）。
 * 没有 Adapter 的渠道在运行时会被路由直接过滤掉，后台不能把它画成可切换目标。
 * 与 lib/adapters/index.js 的登记表人工同步；scripts 里有契约测试兜底。
 */
export const ADAPTER_PROVIDER_IDS = Object.freeze([
  'muapi', 'kling', 'minimax', 'alibaba', 'dashscope', 'openai', 'google',
  'runway', 'luma', 'volcengine', 'ark', 'seedream',
]);

/** providerSecrets.PROVIDER_ENV_KEYS 的环境变量名清单，用于判定「凭据是否已配置」。 */
const PROVIDER_ENV_KEY_NAMES = {
  muapi: ['MUAPI_API_KEY', 'MUAPI_KEY'],
  aliyun: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY'],
  alibaba: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY', 'ALIBABA_API_KEY'],
  dashscope: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY'],
  minimax: ['MINIMAX_API_KEY', 'MINIMAX_KEY'],
  kling: ['KLING_API_KEY', 'KLING_KEY', 'KLING_ACCESS_KEY'],
  volcengine: ['VOLCENGINE_API_KEY', 'ARK_API_KEY', 'VOLC_API_KEY'],
  ark: ['ARK_API_KEY', 'VOLCENGINE_API_KEY', 'VOLC_API_KEY'],
  seedream: ['ARK_API_KEY', 'VOLCENGINE_API_KEY', 'VOLC_API_KEY'],
  bytedance: ['VOLCENGINE_API_KEY', 'ARK_API_KEY', 'VOLC_API_KEY', 'BYTEDANCE_API_KEY'],
  openai: ['OPENAI_API_KEY', 'OPENAI_KEY'],
};

function hasEnvCredential(providerId) {
  const names = PROVIDER_ENV_KEY_NAMES[String(providerId).toLowerCase()] || [`${String(providerId).toUpperCase()}_API_KEY`];
  return names.some((name) => String(process.env[name] || '').trim().length > 0);
}

/**
 * 数据库密文密钥 + 环境变量两条来源，与 getServerProviderApiKey 的查找顺序一致。
 * 一次取全部供应商，避免在快照里按供应商逐条查询。
 */
async function loadCredentialState(transaction = null) {
  const configured = new Set();
  const run = transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  try {
    const rows = await run(`
      SELECT DISTINCT provider FROM ops_bill.provider_secrets
      WHERE name IN ('api_key', 'apiKey')
    `);
    for (const row of rows) configured.add(String(row.provider).toLowerCase());
  } catch {
    // 密钥表不可用时按「全部未配置」处理：宁可少给一个可切换目标，
    // 也不能把管理员引导到一条必然调用失败的直连通道上。
  }
  return {
    isConfigured: (providerId) => (
      configured.has(String(providerId).toLowerCase()) || Boolean(hasEnvCredential(providerId))
    ),
    fromSecretsTable: configured,
  };
}

/**
 * 模型运营快照 SQL。列表与单行读取共用同一份定义：切换主渠道后回给前端的那一行，
 * 必须和列表里刷出来的是同一套字段，否则两处显示会分叉。
 * `where` 只接受写死的片段，不接受拼接外部输入。
 */
function modelOperationsSql(where = '') {
  return `
    WITH usage_window AS (
      SELECT
        LOWER(model) AS model_key,
        COUNT(*) AS calls_30d,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now())) AS calls_today,
        COUNT(*) FILTER (WHERE status IN (${SUCCESS_STATUS_LIST})) AS success_calls_30d,
        ROUND(AVG(duration_ms))::INT AS avg_latency_ms,
        COALESCE(SUM(credit_cost) FILTER (WHERE status IN (${SUCCESS_STATUS_LIST})), 0) AS credits_30d,
        COALESCE(SUM(actual_cost_usd), 0) AS real_cost_30d,
        COALESCE(SUM(actual_cost_usd) FILTER (WHERE created_at >= date_trunc('day', now())), 0) AS real_cost_today,
        MAX(created_at) AS last_called_at
      FROM ai_studio.creations
      WHERE model IS NOT NULL
        AND created_at >= now() - INTERVAL '30 days'
      GROUP BY LOWER(model)
    ),
    route_catalog AS (
      SELECT
        LOWER(pm.model_id) AS model_key,
        COUNT(*) AS route_count,
        COUNT(*) FILTER (WHERE pm.enabled AND p.enabled) AS live_route_count,
        BOOL_OR((pm.cost_config ->> 'cost_per_second') IS NOT NULL) AS bills_per_second,
        JSON_AGG(JSON_BUILD_OBJECT(
          'id', pm.id,
          'providerId', p.id,
          'providerSlug', p.slug,
          'providerName', p.name,
          'providerType', p.provider_type,
          'providerModelId', pm.provider_model_id,
          'priority', pm.priority,
          'enabled', pm.enabled,
          'providerEnabled', p.enabled,
          'channelMetadata', pm.metadata,
          'currency', COALESCE(pm.cost_config ->> 'currency', 'USD'),
          'baseCost', COALESCE((pm.cost_config ->> 'base_cost')::NUMERIC, 0),
          'costConfigured', (pm.cost_config ->> 'base_cost') IS NOT NULL
            AND (pm.cost_config ->> 'base_cost')::NUMERIC > 0,
          'healthStatus', p.health_status,
          'circuitState', p.circuit_state,
          'lastHealthCheckAt', p.last_health_check_at,
          'baseUrl', p.base_url,
          'probeLatencyMs', latest_probe.latency_ms,
          'probeCheckedAt', latest_probe.checked_at,
          'probeKind', latest_probe.details_json ->> 'probeKind'
        ) ORDER BY (COALESCE(pm.metadata ->> '${PRIMARY_METADATA_KEY}', '') = 'true') DESC,
                   pm.priority DESC, p.id ASC) AS routes
      FROM ai_studio.provider_models pm
      JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
      LEFT JOIN LATERAL (
        SELECT hc.latency_ms, hc.checked_at, hc.details_json
        FROM ops_bill.provider_health_checks hc
        WHERE hc.provider = p.id OR hc.provider = p.slug
        ORDER BY hc.checked_at DESC
        LIMIT 1
      ) latest_probe ON TRUE
      GROUP BY LOWER(pm.model_id)
    )
    SELECT
      m.id, m.provider, m.name, m.type, m.cost_usd, m.credits_price, m.is_active,
      m.sort_order, m.metadata_json, m.created_at, m.updated_at,
      COALESCE(u.calls_30d, 0) AS calls_30d,
      COALESCE(u.calls_today, 0) AS calls_today,
      COALESCE(u.success_calls_30d, 0) AS success_calls_30d,
      u.avg_latency_ms,
      COALESCE(u.credits_30d, 0) AS credits_30d,
      COALESCE(u.real_cost_30d, 0) AS real_cost_30d,
      COALESCE(u.real_cost_today, 0) AS real_cost_today,
      u.last_called_at,
      COALESCE(r.route_count, 0) AS route_count,
      COALESCE(r.live_route_count, 0) AS live_route_count,
      COALESCE(r.bills_per_second, FALSE) AS bills_per_second,
      COALESCE(r.routes, '[]'::JSON) AS routes,
      mp.min_gross_margin_rate
    FROM ai_studio.models_config m
    LEFT JOIN usage_window u ON u.model_key = LOWER(m.id)
    LEFT JOIN route_catalog r ON r.model_key = LOWER(m.id)
    LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = m.id AND mp.is_active
    ${where}
    ORDER BY m.sort_order ASC, m.created_at ASC
  `;
}

/**
 * 凭据与 Adapter 是「这条渠道到底能不能调用」的两个硬前提。
 * 它们分别来自环境变量/密钥表和代码登记表，SQL 拿不到，只能在应用层补齐。
 */
async function enrichRoutes(rows, transaction = null) {
  const credentials = await loadCredentialState(transaction);
  const adapters = new Set(ADAPTER_PROVIDER_IDS);
  for (const row of rows || []) {
    for (const route of row.routes || []) {
      const ids = [route.providerId, route.providerSlug];
      route.adapterAvailable = ids.some((id) => adapters.has(String(id || '').toLowerCase()));
      route.credentialsConfigured = ids.some((id) => credentials.isConfigured(id));
      route.isPrimary = String(route.channelMetadata?.[PRIMARY_METADATA_KEY] ?? '') === 'true';
    }
  }
  return rows;
}

/**
 * 模型运营快照：单次查询返回配置 + 近 30 天真实用量 + 已挂载供应商路由。
 * 用量来自 ai_studio.creations —— 它是生成链路唯一实际写入的用量表。
 * 路由渠道必须带上供应商健康/熔断/凭据/主选标记，它们是「这个模型现在实际走谁」
 * 这个问题的一部分答案，缺一项后台就会显示一个运行时根本不会选的供应商。
 */
export async function listModelsWithOperations() {
  const rows = await queryMany(modelOperationsSql());
  return await enrichRoutes(rows);
}

/**
 * 单个模型的运营快照。切换主渠道后必须传同一个事务调用，
 * 否则读回来的是提交前的旧路由，前端就会显示一个还没生效的结果。
 */
export async function getModelWithOperations(id, transaction = null) {
  const run = transaction?.queryMany ? transaction.queryMany.bind(transaction) : queryMany;
  const rows = await run(modelOperationsSql('WHERE m.id = $1'), [id]);
  const enriched = await enrichRoutes(rows, transaction);
  return enriched[0] || null;
}

export async function getModelCenterUsageTotals() {
  const res = await query(`
    SELECT
      COUNT(*) AS calls_today,
      COALESCE(SUM(actual_cost_usd), 0) AS cost_usd_today,
      COALESCE(SUM(credit_cost) FILTER (WHERE status IN (${SUCCESS_STATUS_LIST})), 0) AS credits_today
    FROM ai_studio.creations
    WHERE created_at >= date_trunc('day', now())
  `);
  return res.rows[0] || {};
}

export async function getModelById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order, metadata_json, created_at, updated_at
    FROM models_config
    WHERE id = $1
  `, [id]);
}

const MODEL_ENDPOINT_ALIASES = Object.freeze({
  'flux-dev-image': 'flux-dev',
  'flux-schnell-image': 'flux-schnell',
  'hidream_i1_fast_image': 'hidream-i1-fast',
  'hidream_i1_dev_image': 'hidream-i1-dev',
  'ai-image-upscale': 'ai-image-upscaler',
  'bytedance-seedream-image': 'bytedance-seedream-v3',
  'seedance-lite-text-to-video': 'seedance-lite-t2v',
  'seedance-pro-text-to-video': 'seedance-pro-t2v',
  'seedance-v1.5-pro-text-to-video': 'seedance-v1.5-pro-t2v',
  'seedance-v2.0-text-to-video': 'seedance-v2.0-t2v',
  'kling-v2.1-master-text-to-video': 'kling-v2.1-master-t2v',
  'kling-v2.5-turbo-pro-text-to-video': 'kling-v2.5-turbo-pro-t2v',
  'kling-v2.6-pro-text-to-video': 'kling-v2.6-pro-t2v',
  'kling-v2.1-master-image-to-video': 'kling-v2.1-master-i2v',
  'kling-v2.1-standard-image-to-video': 'kling-v2.1-standard-i2v',
  'wan2.1-text-to-video': 'wan2.1-image-to-video',
  'minimax-hailuo-2.3-standard-text-to-video': 'minimax-hailuo-2.3-standard-t2v',
  'minimax-hailuo-2.3-standard-image-to-video': 'minimax-hailuo-2.3-standard-i2v',
  'kling-v3.0-standard-text-to-video': 'kling-v3.0-standard-t2v',
  'kling-v3.0-standard-image-to-video': 'kling-v3.0-standard-i2v',
  'veo-2-text-to-video': 'veo2-t2v',
  'veo-2-image-to-video': 'veo2-i2v',
});

export async function findModelByEndpointOrId(key) {
  if (!key) return null;
  const clean = String(key).trim().toLowerCase();

  // 1. 精确匹配 ID
  let row = await queryOne('SELECT * FROM models_config WHERE LOWER(id) = $1', [clean]);
  if (row) return row;

  // 2. 显式别名字典映射匹配
  const aliasedId = MODEL_ENDPOINT_ALIASES[clean];
  if (aliasedId) {
    row = await queryOne('SELECT * FROM models_config WHERE LOWER(id) = $1', [aliasedId]);
    if (row) return row;
  }

  // 3. 去掉常见后缀模糊匹配 (如 -image, -video, -text-to-video 等)
  const normalizedKey = clean
    .replace(/-(text-to-video|image-to-video|video-to-video|text-to-image|image-to-image)$/, '')
    .replace(/-(image|video|audio|pro|fast)$/, '');
  row = await queryOne('SELECT * FROM models_config WHERE LOWER(id) = $1 OR LOWER(id) LIKE $2', [normalizedKey, `%${normalizedKey}%`]);
  if (row) return row;

  // 4. 反向模糊匹配（针对类似 seedance-lite 查找 seedance-lite-t2v）
  row = await queryOne('SELECT * FROM models_config WHERE $1 LIKE LOWER(id) || \'%\' OR LOWER(id) LIKE $1 || \'%\'', [clean]);
  return row || null;
}

export async function updateModelConfig(id, updates, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const existing = await getModelById(id, transaction);
  if (!existing) return null;

  const cost_usd = updates.cost_usd !== undefined ? Number(updates.cost_usd) : existing.cost_usd;
  const credits_price = updates.credits_price !== undefined ? Number(updates.credits_price) : existing.credits_price;
  const is_active = updates.is_active !== undefined ? Boolean(updates.is_active) : existing.is_active;
  const name = updates.name || existing.name;
  const provider = updates.provider || existing.provider || 'muapi';
  const sort_order = updates.sort_order !== undefined ? Number(updates.sort_order) : existing.sort_order;
  
  let metadata = {};
  try {
    metadata = typeof existing.metadata_json === 'string' ? JSON.parse(existing.metadata_json) : (existing.metadata_json || {});
  } catch {}
  if (updates.routing_mode !== undefined) {
    metadata.routing_mode = updates.routing_mode;
  }
  if (updates.metadata_json !== undefined) {
    metadata = typeof updates.metadata_json === 'object' ? { ...metadata, ...updates.metadata_json } : metadata;
  }

  const timestamp = nowIso();

  await run(`
    UPDATE models_config
    SET name = $1, cost_usd = $2, credits_price = $3, is_active = $4, sort_order = $5, provider = $6, metadata_json = $7::jsonb, updated_at = $8
    WHERE id = $9
  `, [name, cost_usd, credits_price, is_active, sort_order, provider, JSON.stringify(metadata), timestamp, id]);

  return await getModelById(id, transaction);
}
