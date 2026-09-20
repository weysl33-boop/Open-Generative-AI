import 'server-only';

import { query, queryOne, execute, nowIso, randomId } from '../db/index.js';
import { getCanonicalModelById, getModelPricing, listProviderModelsByModelId } from '../repositories/aiCatalog.js';

const DEFAULT_QUOTE_TTL_MINUTES = 5;

/**
 * 模型计价引擎 (PricingEngine)
 * 计算用户端销售积分 (Credits)，并与底层真实 API 成本完全解耦
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

  // 估算毛利率：1 积分 ≈ ¥0.07（与订阅体系一致），按 7.2 CNY/USD 折算。
  const CNY_PER_CREDIT = 0.07;
  const USD_PER_CNY = 7.2;
  const estimatedSellingPriceUsd = finalCredits * CNY_PER_CREDIT / USD_PER_CNY;
  const grossMarginUsd = Math.max(0, estimatedSellingPriceUsd - estimatedProviderCostUsd);
  const grossMarginRate = estimatedSellingPriceUsd > 0
    ? Number((grossMarginUsd / estimatedSellingPriceUsd).toFixed(4))
    : 0;

  const minMarginRate = Number(pricing.min_gross_margin_rate || 0.3);
  const isMarginWarning = grossMarginRate < minMarginRate;

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
    estimatedSellingPriceUsd: Number(estimatedSellingPriceUsd.toFixed(4)),
    grossMarginRate,
    isMarginWarning,
  };
}

/**
 * 生成防篡改 Quote 报价单 (有效期 5 分钟)
 */
export async function createGenerationQuote({
  userId,
  user,
  modelId,
  parameters = {},
  subscriptionLevel = 'free',
  ttlMinutes = DEFAULT_QUOTE_TTL_MINUTES,
  transaction = null,
} = {}) {
  const effectiveUserId = userId || user?.id;
  if (!effectiveUserId) throw Object.assign(new Error('用户未登录'), { code: 'UNAUTHENTICATED' });

  const calculation = await calculateModelPrice({
    modelId,
    parameters,
    subscriptionLevel,
    transaction,
  });

  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const quoteId = `quote_${randomId()}`;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000);

  await run(`
    INSERT INTO ai_studio.generation_quotes
      (id, user_id, model_id, parameters_json, credits_quoted, pricing_breakdown_json,
       estimated_provider_cost_usd, expires_at, created_at)
    VALUES ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7, $8, $9)
  `, [
    quoteId, effectiveUserId, calculation.modelId, JSON.stringify(parameters || {}),
    calculation.credits, JSON.stringify(calculation.pricingBreakdown),
    calculation.estimatedProviderCostUsd, expiresAt.toISOString(), now.toISOString(),
  ]);

  return {
    quoteId,
    modelId: calculation.modelId,
    credits: calculation.credits,
    pricingBreakdown: calculation.pricingBreakdown,
    expiresAt: expiresAt.toISOString(),
    calculation,
  };
}

/**
 * 校验并消费 Quote 报价单
 * 严防前端恶意篡改 Credits 字段
 */
export async function verifyAndConsumeQuote({
  quoteId,
  userId,
  user,
  expectedUserId,
  modelId,
  expectedModelId,
  transaction = null,
} = {}) {
  if (!quoteId) return null;

  const targetUserId = userId || user?.id || expectedUserId;
  const targetModelId = modelId || expectedModelId;

  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const executeRun = transaction?.execute ? transaction.execute.bind(transaction) : execute;

  const quote = await run(
    'SELECT * FROM ai_studio.generation_quotes WHERE id = $1 FOR UPDATE',
    [quoteId]
  );

  if (!quote) {
    throw Object.assign(new Error('报价单不存在或已失效'), { code: 'QUOTE_NOT_FOUND' });
  }

  if (targetUserId && quote.user_id !== targetUserId) {
    throw Object.assign(new Error('报价单归属用户不符'), { code: 'QUOTE_USER_MISMATCH' });
  }

  if (targetModelId && quote.model_id !== targetModelId) {
    throw Object.assign(new Error('报价单模型与当前任务不一致'), { code: 'QUOTE_MODEL_MISMATCH' });
  }

  if (quote.consumed_at) {
    throw Object.assign(new Error('该报价单已被使用，请重新获取报价'), { code: 'QUOTE_ALREADY_CONSUMED' });
  }

  const now = new Date();
  if (new Date(quote.expires_at).getTime() < now.getTime()) {
    throw Object.assign(new Error('报价单已过期，请重新获取最新报价'), { code: 'QUOTE_EXPIRED' });
  }

  // 标记已被消费
  await executeRun(
    'UPDATE ai_studio.generation_quotes SET consumed_at = $1 WHERE id = $2',
    [now.toISOString(), quoteId]
  );

  return {
    id: quote.id,
    quoteId: quote.id,
    credits: Number(quote.credits_quoted),
    estimatedCostUsd: Number(quote.estimated_provider_cost_usd || 0),
    pricingBreakdown: typeof quote.pricing_breakdown_json === 'string'
      ? JSON.parse(quote.pricing_breakdown_json)
      : (quote.pricing_breakdown_json || {}),
    consumed_at: now.toISOString(),
    is_consumed: true,
  };
}
