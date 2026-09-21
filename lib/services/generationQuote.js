import 'server-only';

import { nowIso } from '../db/index.js';
import { getCanonicalModelById } from '../repositories/aiCatalog.js';
import { findModelByEndpointOrId } from '../repositories/models.js';
import { consumeGenerationQuote, insertGenerationQuote, lockGenerationQuote } from '../repositories/quotes.js';
import { getSubscription } from './billing.js';
import { calculateModelPrice } from './pricingEngine.js';

export const QUOTE_SOURCES = Object.freeze({
  PARITY: 'parity',
  CATALOG: 'catalog',
});

const DEFAULT_QUOTE_TTL_MINUTES = 5;

// 报价刻度开关。model_pricing 目前填的是「千级积分」刻度，而线上按 models_config 的
// 1–20 积分收费；在老板给出目标价之前切到 catalog 会把全站价格放大 10–50 倍。
function configuredSource() {
  return String(process.env.GENERATION_QUOTE_SOURCE || '').trim() === QUOTE_SOURCES.CATALOG
    ? QUOTE_SOURCES.CATALOG
    : QUOTE_SOURCES.PARITY;
}

function assertChargeable(credits) {
  const value = Number(credits);
  if (!Number.isInteger(value) || value <= 0) {
    throw Object.assign(new Error('目标模型未配置有效额度价格'), { code: 'MODEL_PRICE_INVALID' });
  }
  return value;
}

/**
 * 服务器报价的唯一入口：任何「这次生成扣多少积分」的问题都必须经过这里。
 * 请求体里的积分字段一律不被读取，客户端最多能带回一个 quoteId。
 */
export async function resolveGenerationQuote({
  modelId,
  model = null,
  userId = null,
  parameters = {},
  subscriptionLevel = null,
  source = configuredSource(),
  transaction = null,
} = {}) {
  const legacy = model || (modelId ? await findModelByEndpointOrId(modelId) : null);
  if (!legacy) throw Object.assign(new Error('目标模型不存在'), { code: 'MODEL_NOT_FOUND' });
  const canonical = await getCanonicalModelById(legacy.id, transaction);

  if (source === QUOTE_SOURCES.CATALOG) {
    if (!canonical) {
      throw Object.assign(new Error(`模型 ${legacy.id} 尚未进入标准目录，无法按目录刻度报价`), { code: 'MODEL_NOT_SYNCED' });
    }
    const level = subscriptionLevel
      || (userId ? (await getSubscription(userId))?.plan_id || 'free' : 'free');
    const calculation = await calculateModelPrice({
      modelId: canonical.id,
      parameters,
      subscriptionLevel: level,
      transaction,
    });
    return {
      source: QUOTE_SOURCES.CATALOG,
      modelId: canonical.id,
      catalogModelId: canonical.id,
      credits: assertChargeable(calculation.credits),
      pricingBreakdown: { ...calculation.pricingBreakdown, quoteSource: QUOTE_SOURCES.CATALOG },
      estimatedProviderCostUsd: calculation.estimatedProviderCostUsd,
    };
  }

  return {
    source: QUOTE_SOURCES.PARITY,
    modelId: legacy.id,
    catalogModelId: canonical?.id ?? null,
    credits: assertChargeable(legacy.credits_price),
    pricingBreakdown: {
      quoteSource: QUOTE_SOURCES.PARITY,
      pricedBy: 'models_config.credits_price',
      baseCredits: Number(legacy.credits_price),
    },
    estimatedProviderCostUsd: Number(legacy.cost_usd || 0),
  };
}

/** 落一张未消费的预飞报价，供 UI 展示；与任务创建走同一个 resolveGenerationQuote。 */
export async function createGenerationQuote({
  userId,
  modelId,
  parameters = {},
  subscriptionLevel = null,
  ttlMinutes = DEFAULT_QUOTE_TTL_MINUTES,
  transaction = null,
} = {}) {
  if (!userId) throw Object.assign(new Error('用户未登录'), { code: 'UNAUTHENTICATED' });
  const quote = await resolveGenerationQuote({ modelId, parameters, userId, subscriptionLevel, transaction });
  const payload = {
    quoteId: null,
    modelId: quote.modelId,
    source: quote.source,
    credits: quote.credits,
    pricingBreakdown: quote.pricingBreakdown,
    estimatedProviderCostUsd: quote.estimatedProviderCostUsd,
    expiresAt: null,
  };
  if (!quote.catalogModelId) {
    // 报价表按标准模型建外键：目录缺口只牺牲这张票据，不能凭空造一条无法归属的报价。
    console.warn('[generation/quote-unsynced]', { modelId: quote.modelId, userId });
    return payload;
  }
  const stored = await insertGenerationQuote({
    userId,
    modelId: quote.catalogModelId,
    parameters,
    credits: quote.credits,
    pricingBreakdown: quote.pricingBreakdown,
    estimatedProviderCostUsd: quote.estimatedProviderCostUsd,
    ttlMinutes,
    transaction,
  });
  return { ...payload, quoteId: stored.quoteId, expiresAt: stored.expiresAt };
}

/**
 * 核销客户端带回的预飞报价。数额以服务端重算结果为准：报价与重算不一致说明目录价已变，
 * 直接让客户端重新取票，避免「显示 5 积分、实扣 50 积分」。
 */
export async function consumePreparedQuote({ quoteId, userId, modelId, credits, transaction = null } = {}) {
  const quote = await lockGenerationQuote(quoteId, transaction);
  if (!quote) throw Object.assign(new Error('报价单不存在或已失效'), { code: 'QUOTE_NOT_FOUND' });
  if (quote.user_id !== userId) throw Object.assign(new Error('报价单归属用户不符'), { code: 'QUOTE_USER_MISMATCH' });
  if (modelId && quote.model_id !== modelId) {
    throw Object.assign(new Error('报价单模型与当前任务不一致'), { code: 'QUOTE_MODEL_MISMATCH' });
  }
  if (quote.consumed_at) throw Object.assign(new Error('该报价单已被使用，请重新获取报价'), { code: 'QUOTE_ALREADY_CONSUMED' });
  if (new Date(quote.expires_at).getTime() < Date.now()) {
    throw Object.assign(new Error('报价单已过期，请重新获取最新报价'), { code: 'QUOTE_EXPIRED' });
  }
  if (Number(quote.credits_quoted) !== Number(credits)) {
    throw Object.assign(new Error('模型价格已更新，请重新获取报价'), { code: 'QUOTE_STALE' });
  }
  await consumeGenerationQuote(quoteId, transaction);
  return quoteId;
}

/** 任务实际结算的报价：落一张已消费的票据并挂到 creations.quote_id。 */
export async function recordSettledQuote({ quote, creationId, userId, parameters, transaction = null }) {
  if (!quote?.catalogModelId) {
    console.warn('[generation/quote-skipped]', { creationId, modelId: quote?.modelId ?? null });
    return null;
  }
  const stored = await insertGenerationQuote({
    userId,
    modelId: quote.catalogModelId,
    parameters,
    credits: quote.credits,
    pricingBreakdown: { ...quote.pricingBreakdown, creationId },
    estimatedProviderCostUsd: quote.estimatedProviderCostUsd,
    consumedAt: nowIso(),
    transaction,
  });
  return stored.quoteId;
}
