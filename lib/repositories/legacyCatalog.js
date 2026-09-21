import 'server-only';

import { queryOne, queryMany, execute } from '../db/index.js';

// 老目录（models_config）与中台目录（ai_models / provider_models / routing_policies）的对账。
// 全部语句只 INSERT、且带 NOT EXISTS 与 ON CONFLICT DO NOTHING：
// 后台改过的渠道、定价、路由策略永远不会被同步覆盖，历史任务引用的模型也不会消失。

const CATEGORY_CASE = `
  CASE
    WHEN mc.type IN ('image', 'layers', 'clipping') THEN 'image'
    WHEN mc.type IN ('video', 'cinema', 'lipsync', 'recast', 'motion-control', 'v2v', 'i2v', 't2v') THEN 'video'
    WHEN mc.type = 'audio' THEN 'audio'
    ELSE 'other'
  END`;

export async function syncCanonicalModelsFromLegacy(transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run(`
    INSERT INTO ai_studio.ai_models
      (id, slug, name, display_name, category, description, cover, status, sort, is_featured,
       capabilities, created_at, updated_at)
    SELECT
      mc.id,
      mc.id,
      COALESCE(NULLIF(btrim(mc.name), ''), mc.id),
      COALESCE(NULLIF(btrim(mc.name), ''), mc.id),
      ${CATEGORY_CASE},
      COALESCE(NULLIF(mc.metadata_json ->> 'description', ''), mc.name, mc.id),
      COALESCE(mc.metadata_json ->> 'cover', ''),
      CASE WHEN mc.is_active THEN 'active' ELSE 'disabled' END,
      COALESCE(mc.sort_order, 0),
      FALSE,
      COALESCE(mc.metadata_json, '{}'::jsonb) || jsonb_build_object('_synced_from', 'models_config'),
      mc.created_at,
      now()
    FROM ai_studio.models_config mc
    WHERE NOT EXISTS (SELECT 1 FROM ai_studio.ai_models m WHERE m.id = mc.id)
    ON CONFLICT DO NOTHING
  `);
}

// 每个老模型先挂一条 muapi 渠道：provider 字段是老表的「厂商」标签，不代表可直连的网关，
// 真正的调用端点只有聚合网关，所以这里把 mc.id 原样保留成 provider_model_id，
// 路由层选中它时与今天的行为完全一致。厂商标签记在 metadata 里，供后续接官方 Adapter 时使用。
export async function syncProviderChannelsFromLegacy(transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run(`
    INSERT INTO ai_studio.provider_models
      (id, model_id, provider_id, provider_model_id, enabled, priority,
       cost_config, endpoint_config, metadata, timeout, created_at, updated_at)
    SELECT
      'pm_' || replace(mc.id, '-', '_') || '_muapi',
      mc.id,
      'muapi',
      mc.id,
      mc.is_active,
      100,
      jsonb_build_object('currency', 'USD', 'base_cost', COALESCE(mc.cost_usd, 0)),
      jsonb_build_object('endpoint', mc.id),
      jsonb_build_object('synced_from', 'models_config', 'legacy_brand', mc.provider),
      120000,
      mc.created_at,
      now()
    FROM ai_studio.models_config mc
    WHERE NOT EXISTS (
      SELECT 1 FROM ai_studio.provider_models pm
      WHERE pm.model_id = mc.id AND pm.provider_id = 'muapi' AND pm.provider_model_id = mc.id
    )
    ON CONFLICT DO NOTHING
  `);
}

// 少数老模型本来就是走厂商直连的（火山方舟 Seedream 图像系），它们的厂商标签写的是
// bytedance，而可直连网关是 volcengine。把这件事落成渠道数据，调用链只看数据不看名字。
//
// 匹配范围只到「该网关确实能调用」为止：Seedance 全系 137 个模型是视频，方舟的
// /images/generations 端点跑不了它们，登记成 volcengine 渠道等于给路由塞进一堆必死路径。
// 方舟视频要等实现了对应端点的 Adapter 之后再登记。
//
// base_url 与 lib/adapters 里的默认域名一致；provider 行只补不改，
// 后台改过的地址 / 熔断状态 / 余额都不会被同步覆盖。
const DIRECT_GATEWAYS = [
  {
    providerId: 'volcengine',
    slug: 'volcengine',
    name: '火山方舟 / Volcengine Ark',
    providerType: 'official',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    currency: 'CNY',
    priority: 110,
    matches: `(mc.type = 'image' AND lower(mc.id) LIKE 'seedream%')`,
  },
];

export async function syncGatewayProviders(transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  let inserted = 0;
  for (const gateway of DIRECT_GATEWAYS) {
    inserted += await run(`
      INSERT INTO ai_studio.ai_providers
        (id, slug, name, provider_type, enabled, priority, base_url, api_mode, currency, metadata, created_at, updated_at)
      VALUES ($1::text, $2::text, $3::text, $4::text, TRUE, 100, $5::text, 'async', $6::text,
              jsonb_build_object('synced_from', 'adapter_registry'), now(), now())
      ON CONFLICT DO NOTHING
    `, [gateway.providerId, gateway.slug, gateway.name, gateway.providerType, gateway.baseUrl, gateway.currency]);
  }
  return inserted;
}

export async function syncDirectProviderChannels(transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  let inserted = 0;
  for (const gateway of DIRECT_GATEWAYS) {
    inserted += await run(`
      INSERT INTO ai_studio.provider_models
        (id, model_id, provider_id, provider_model_id, enabled, priority,
         cost_config, endpoint_config, metadata, timeout, created_at, updated_at)
      SELECT
        'pm_' || replace(mc.id, '-', '_') || '_' || $1::text,
        mc.id,
        $1::text,
        mc.id,
        mc.is_active,
        $2::int,
        jsonb_build_object('currency', $3::text, 'base_cost', COALESCE(mc.cost_usd, 0)),
        jsonb_build_object('model', mc.id),
        jsonb_build_object('synced_from', 'models_config', 'legacy_brand', mc.provider),
        120000,
        mc.created_at,
        now()
      FROM ai_studio.models_config mc
      WHERE ${gateway.matches}
        AND NOT EXISTS (
          SELECT 1 FROM ai_studio.provider_models pm
          WHERE pm.model_id = mc.id AND pm.provider_id = $1::text
        )
      ON CONFLICT DO NOTHING
    `, [gateway.providerId, gateway.priority, gateway.currency]);
  }
  return inserted;
}

export async function syncRoutingPolicies(transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run(`
    INSERT INTO ai_studio.routing_policies
      (id, model_id, routing_mode, weights, circuit_breaker_config, failover_enabled, created_at, updated_at)
    SELECT
      'rp_' || replace(m.id, '-', '_'),
      m.id,
      'balanced',
      '{"cost":0.4,"success_rate":0.3,"speed":0.2,"capacity":0.1}'::jsonb,
      '{"failure_threshold":3,"cooling_period_sec":60,"half_open_requests":2}'::jsonb,
      TRUE,
      now(),
      now()
    FROM ai_studio.ai_models m
    WHERE NOT EXISTS (SELECT 1 FROM ai_studio.routing_policies r WHERE r.model_id = m.id)
    ON CONFLICT DO NOTHING
  `);
}

// 定价刻度冲突（只读上报，不自动修）：019 已给每个 ai_models 建了 model_pricing 行，
// 刻度是「套餐/千级积分」，而线上实际按 models_config.credits_price 的 1–20 积分收费，
// 且 min_credits 默认 10 会把 2 积分模型抬到 10。切换报价引擎等于全站重新定价，
// 属于商业决策，这里只把差异量报出来，写哪一套由后台确认后单独执行。
export async function getCatalogGapSummary(transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const row = await run(`
    SELECT
      (SELECT count(*) FROM ai_studio.models_config)::int AS legacy_models,
      (SELECT count(*) FROM ai_studio.ai_models)::int AS canonical_models,
      (SELECT count(*) FROM ai_studio.models_config mc WHERE NOT EXISTS
        (SELECT 1 FROM ai_studio.ai_models m WHERE m.id = mc.id))::int AS legacy_without_model,
      (SELECT count(*) FROM ai_studio.ai_models m WHERE NOT EXISTS
        (SELECT 1 FROM ai_studio.provider_models pm WHERE pm.model_id = m.id))::int AS model_without_channel,
      (SELECT count(*) FROM ai_studio.ai_models m WHERE NOT EXISTS
        (SELECT 1 FROM ai_studio.model_pricing p WHERE p.model_id = m.id))::int AS model_without_pricing,
      (SELECT count(*) FROM ai_studio.ai_models m WHERE NOT EXISTS
        (SELECT 1 FROM ai_studio.routing_policies r WHERE r.model_id = m.id))::int AS model_without_routing,
      (SELECT count(*) FROM ai_studio.models_config mc
        WHERE mc.is_active AND NOT EXISTS
        (SELECT 1 FROM ai_studio.provider_models pm
          JOIN ai_studio.ai_providers p ON p.id = pm.provider_id
          WHERE pm.model_id = mc.id AND pm.enabled AND p.enabled))::int AS active_without_channel,
      (SELECT count(*) FROM ai_studio.model_pricing mp
        JOIN ai_studio.models_config mc ON mc.id = mp.model_id
        WHERE mp.base_credits IS DISTINCT FROM mc.credits_price)::int AS legacy_pricing_mismatch,
      (SELECT count(*) FROM ai_studio.model_pricing mp
        JOIN ai_studio.models_config mc ON mc.id = mp.model_id
        WHERE mp.min_credits > COALESCE(mc.credits_price, 0))::int AS legacy_pricing_floor_above_current
    FROM (SELECT 1) _
  `);
  return row;
}

export async function listLegacyBrandSummary() {
  return queryMany(`
    SELECT mc.provider AS brand, count(*)::int AS models
    FROM ai_studio.models_config mc
    GROUP BY mc.provider
    ORDER BY count(*) DESC, mc.provider ASC
  `);
}
