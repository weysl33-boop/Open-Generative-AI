import 'server-only';
import { queryMany, execute } from '../lib/db/index.js';

// Solvent pricing: base = 2.3x provider cost (≈57% gross margin), 1 credit ≈ ¥0.07.
const USD_CNY = 7.2;
const CNY_PER_CREDIT = 0.07;
const MARGIN_MULT = 2.3;

const FORMULA_CONFIG = {
  resolution_multipliers: { '720p': 1.0, '1080p': 1.4, '2k': 1.8, '4k': 2.4 },
  duration_multipliers: { '5': 1.0, '10': 2.0, '15': 2.9, '20': 3.8 },
  quality_multipliers: { standard: 1.0, high: 1.2, hd: 1.2, pro: 1.4, professional: 1.4 },
};

const SUBSCRIPTION_DISCOUNTS = { free: 1.0, starter: 0.95, basic: 0.90, plus: 0.85, pro: 0.80 };

async function main() {
  const rows = await queryMany(
    "SELECT pm.model_id, m.category, MIN((pm.cost_config->>'base_cost')::numeric) AS min_cost_usd " +
    "FROM ai_studio.provider_models pm JOIN ai_studio.ai_models m ON m.id = pm.model_id " +
    "WHERE pm.provider_id = 'muapi' AND pm.enabled AND pm.cost_config ? 'base_cost' " +
    "GROUP BY pm.model_id, m.category"
  );
  const apply = process.argv.includes('--apply');
  let n = 0;
  for (const r of rows) {
    const costUsd = Number(r.min_cost_usd);
    const costCny = costUsd * USD_CNY;
    const base = Math.max(10, Math.round((costCny / CNY_PER_CREDIT) * MARGIN_MULT / 5) * 5);
    const isVideo = r.category === 'video';
    const pricingType = isVideo ? 'formula' : 'fixed';
    const formula = isVideo ? FORMULA_CONFIG : null;
    console.log((apply ? 'APPLY' : 'DRY') + '\t' + r.model_id + '\tcost$' + costUsd + ' => base ' + base + ' (' + pricingType + ')');
    if (apply) {
      await execute(
        "UPDATE ai_studio.model_pricing SET pricing_type=$2, base_credits=$3, " +
        "formula_config=COALESCE($4::jsonb, formula_config), subscription_discounts=$5::jsonb, min_credits=10, min_gross_margin_rate=0.40, updated_at=now() WHERE model_id=$1",
        [r.model_id, pricingType, base, formula ? JSON.stringify(formula) : null, JSON.stringify(SUBSCRIPTION_DISCOUNTS)]
      );
      n++;
    }
  }
  console.log((apply ? 'APPLIED' : 'DRY-RUN') + ' ' + (apply ? n : rows.length) + ' rows');
}
main().then(() => process.exit(0)).catch((e) => { console.error('SEED_FAILED:', e.message); process.exit(1); });
