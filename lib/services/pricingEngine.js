import 'server-only';

import { getCanonicalModelById, getModelPricing, listProviderModelsByModelId } from '../repositories/aiCatalog.js';

/**
 * 模型计价引擎 (PricingEngine)
 * 计算用户端销售积分 (Credits)，并与底层真实 API 成本完全解耦
 *
 * 这里只产出 Credits 与上游成本估算，不再算毛利率：报价链路曾按 ¥0.07/Credit
 * 自带一套估值，和报表用的 $0.01/Credit 互相矛盾，同一笔消耗有两个毛利率。
 * 估值口径统一由 lib/services/creditValuation.js 提供，毛利在模型中心算。
 */
export async function calculateModelPrice({
  modelId,
  pricingConfig = null,
  parameters = {},
  subscriptionLevel = 'free',
  transaction = null,
} = {}) {
  let model = null;
  if (modelId) {
    model = await getCanonicalModelById(modelId, transaction);
    if (!model) throw Object.assign(new Error(`模型 ${modelId} 不存在`), { code: 'MODEL_NOT_FOUND' });
  }

  const pricing = pricingConfig || (model ? await getModelPricing(model.id, transaction) : null) || {
    pricing_type: 'fixed',
    base_credits: 50,
    formula_config: {},
    subscription_discounts: {},
    min_credits: 10,
    min_gross_margin_rate: 0.30,
  };

  const formulaConfig = pricing.formula_config || {};
  const baseCredits = Number(pricing.base_credits || 50);

  let resolutionMultiplier = 1.0;
  let durationMultiplier = 1.0;
  let qualityMultiplier = 1.0;

  // 1. 分辨率倍率计算
  const resolution = String(parameters.resolution || parameters.size || '').toLowerCase();
  if (resolution && formulaConfig.resolution_multipliers) {
    for (const [resKey, mult] of Object.entries(formulaConfig.resolution_multipliers)) {
      if (resolution.includes(resKey.toLowerCase())) {
        resolutionMultiplier = Number(mult);
        break;
      }
    }
  }

  // 2. 视频时长倍率计算
  const duration = parseInt(parameters.duration || parameters.video_duration, 10);
  if (Number.isFinite(duration) && formulaConfig.duration_multipliers) {
    const mult = formulaConfig.duration_multipliers[String(duration)];
    if (mult) durationMultiplier = Number(mult);
    else if (duration > 5) durationMultiplier = Number((1.0 + (duration - 5) * 0.15).toFixed(2));
  }

  // 3. 质量模式倍率计算
  const quality = String(parameters.quality || parameters.mode || 'standard').toLowerCase();
  if (formulaConfig.quality_multipliers && formulaConfig.quality_multipliers[quality]) {
    qualityMultiplier = Number(formulaConfig.quality_multipliers[quality]);
  }

  // 4. 会员等级折扣
  const discounts = pricing.subscription_discounts || {};
  const discountRate = discounts[subscriptionLevel] !== undefined ? Number(discounts[subscriptionLevel]) : 1.0;

  // 综合计算 Credits
  let finalCredits = baseCredits;
  if (pricing.pricing_type === 'formula') {
    finalCredits = Math.round(baseCredits * resolutionMultiplier * durationMultiplier * qualityMultiplier * discountRate);
  } else {
    // 固定计费模式也可享受会员折扣
    finalCredits = Math.round(baseCredits * discountRate);
  }

  const minCredits = Number(pricing.min_credits || 10);
  finalCredits = Math.max(minCredits, finalCredits);

  // 5. 估算上游供应商成本 (USD)
  const providerModels = model ? await listProviderModelsByModelId(model.id, { enabledOnly: true }) : [];
  let estimatedProviderCostUsd = 0;
  if (providerModels && providerModels.length > 0) {
    const costs = providerModels.map((pm) => Number(pm.cost_config?.base_cost || 0));
    estimatedProviderCostUsd = costs.reduce((a, b) => a + b, 0) / costs.length;
    if (duration > 5) {
      estimatedProviderCostUsd += (duration - 5) * 0.05;
    }
  }

  return {
    modelId: model?.id || modelId || 'custom',
    modelName: model?.name || 'custom',
    credits: finalCredits,
    pricingType: pricing.pricing_type,
    pricingBreakdown: {
      baseCredits,
      resolutionMultiplier,
      durationMultiplier,
      qualityMultiplier,
      subscriptionDiscount: discountRate,
      subscriptionLevel,
    },
    estimatedProviderCostUsd: Number(estimatedProviderCostUsd.toFixed(4)),
  };
}
