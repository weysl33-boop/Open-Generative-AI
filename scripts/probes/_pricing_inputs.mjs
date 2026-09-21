// 只读：为 docs/定价提案-积分刻度统一.md 取数。不含任何写入。
// 注意：本脚本读的是 .env.local 的 DATABASE_URL —— 那台是线上库。只要 SELECT。
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const p = require.resolve('server-only'); require.cache[p] = { id: p, filename: p, loaded: true, exports: {} };
if (fs.existsSync('.env.local')) process.loadEnvFile('.env.local');
const { Client } = await import('pg');

// 渠道 base_cost 折 USD（该字段混合了每次生成/每秒/每千字符三种单位，见提案 §2.2）。
const COST_USD = `
  CASE WHEN pm.cost_config->>'currency' = 'CNY'
       THEN (pm.cost_config->>'base_cost')::numeric / 7.2
       ELSE (pm.cost_config->>'base_cost')::numeric END
`;

const db = new Client({ connectionString: process.env.DATABASE_URL });
await db.connect();

async function show(title, sql) {
  try {
    const r = await db.query(sql);
    console.log(`\n=== ${title} (${r.rowCount}) ===`);
    for (const row of r.rows) console.log(JSON.stringify(row));
  } catch (error) {
    console.log(`\n=== ${title} FAILED: ${error.message} ===`);
  }
}

await show('§1 套餐与交付率', `
  SELECT id, name, price_cny, credits_included, enabled, is_active,
         features_json->'meta'->>'quotaBonus' AS quota_bonus,
         features_json->'meta'->>'yearlyCny' AS yearly_cny
  FROM ops_bill.plans_config ORDER BY price_cny::numeric
`);

await show('§2.1 老目录价格分布 × 模态 + 成本覆盖度', `
  SELECT type, credits_price, count(*)::int AS n,
         count(*) FILTER (WHERE COALESCE(cost_usd,0) > 0)::int AS with_known_cost
  FROM ai_studio.models_config WHERE is_active GROUP BY 1,2 ORDER BY 1,2
`);

await show('§2.1 锚点 A：cost_usd > 0 的全部行', `
  SELECT id, type, provider, credits_price, cost_usd
  FROM ai_studio.models_config WHERE COALESCE(cost_usd,0) > 0 ORDER BY cost_usd DESC
`);

await show('§2.2 锚点 B：官方渠道人工回填成本', `
  SELECT pm.provider_id, pm.model_id, m.name, m.category, pm.priority,
         pm.cost_config->>'currency' AS cur,
         (pm.cost_config->>'base_cost')::numeric AS base_cost,
         pm.cost_config
  FROM ai_studio.provider_models pm
  LEFT JOIN ai_studio.ai_models m ON m.id = pm.model_id
  WHERE pm.provider_id <> 'muapi' ORDER BY pm.provider_id, base_cost DESC
`);

await show('§2.2 同一模型跨渠道成本跨度 > 3 倍（定价输入不可收敛的证据）', `
  WITH c AS (
    SELECT pm.model_id, min(${COST_USD}) AS usd_low, max(${COST_USD}) AS usd_high
    FROM ai_studio.provider_models pm
    WHERE COALESCE((pm.cost_config->>'base_cost')::numeric, 0) > 0 GROUP BY 1
  )
  SELECT m.id, m.name, m.category, round(c.usd_low::numeric,4) AS usd_low,
         round(c.usd_high::numeric,4) AS usd_high,
         round((c.usd_high / NULLIF(c.usd_low,0))::numeric, 1) AS ratio
  FROM ai_studio.ai_models m JOIN c ON c.model_id = m.id
  WHERE c.usd_high / NULLIF(c.usd_low,0) > 3 ORDER BY ratio DESC
`);

await show('§2.4 成本覆盖度（按模态）', `
  WITH c AS (
    SELECT pm.model_id FROM ai_studio.provider_models pm
    WHERE COALESCE((pm.cost_config->>'base_cost')::numeric, 0) > 0 GROUP BY 1
  )
  SELECT m.category, count(*)::int AS models, count(c.model_id)::int AS with_cost,
         (count(*) - count(c.model_id))::int AS without_cost
  FROM ai_studio.ai_models m LEFT JOIN c ON c.model_id = m.id GROUP BY 1 ORDER BY 2 DESC
`);

await show('§2.4 真实成本流水覆盖', `
  SELECT (SELECT count(*) FROM ai_studio.provider_cost_records) AS cost_rows,
         (SELECT count(*) FROM ai_studio.creations) AS creations,
         (SELECT count(*) FROM ai_studio.ai_models) AS models,
         (SELECT count(*) FROM ai_studio.model_pricing) AS pricing,
         (SELECT count(*) FROM ai_studio.ai_models m WHERE NOT EXISTS
            (SELECT 1 FROM ai_studio.model_pricing p WHERE p.model_id = m.id)) AS without_pricing
`);

await show('§3 019 种子与现价的倍数对照（video/base >= 100）', `
  SELECT p.model_id, m.name, m.category, p.pricing_type, p.base_credits, p.min_credits,
         mc.credits_price AS legacy_price, mc.cost_usd
  FROM ai_studio.model_pricing p
  JOIN ai_studio.ai_models m ON m.id = p.model_id
  LEFT JOIN ai_studio.models_config mc ON mc.id = p.model_id
  WHERE p.base_credits >= 100 ORDER BY p.base_credits DESC
`);

await show('§4.4 实际扣费样本', `
  SELECT model, credit_cost, count(*)::int AS n
  FROM ai_studio.creations GROUP BY 1,2 ORDER BY 3 DESC LIMIT 25
`);

await db.end();
