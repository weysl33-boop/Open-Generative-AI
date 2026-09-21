import { modelHealthState, modelRouteIssues, officialCostOf } from './routing.js';

/**
 * 成本 → Credits → 售价 → 倍率 → 毛利 的唯一换算实现。
 * 服务端快照与客户端保存后的乐观回算共用，避免计价规则散落到组件。
 *
 * providerCostUsd 为 null/undefined 表示「成本未知」，与 0（免费）是两回事：
 * 未知成本必须让毛利一起变 null，否则后台会把「没回填成本」显示成 100% 毛利。
 */
export function computePricing({ providerCostUsd, credits, creditUsdRate }) {
  const costKnown =
    providerCostUsd !== null && providerCostUsd !== undefined && Number.isFinite(Number(providerCostUsd));
  const cost = costKnown ? Number(providerCostUsd) : null;
  const points = Number(credits) || 0;
  const rate = Number(creditUsdRate);
  const usableRate = Number.isFinite(rate) && rate > 0 ? rate : null;

  const userPriceUsd = usableRate === null ? null : Number((points * usableRate).toFixed(6));
  const grossMarginUsd =
    userPriceUsd === null || !costKnown ? null : Number((userPriceUsd - cost).toFixed(6));

  return {
    providerCostUsd: cost,
    costKnown,
    credits: points,
    userPriceUsd,
    grossMarginUsd,
    markup: costKnown && cost > 0 && userPriceUsd !== null ? Number((userPriceUsd / cost).toFixed(2)) : null,
    marginRate:
      userPriceUsd && userPriceUsd > 0 && grossMarginUsd !== null
        ? Number(((grossMarginUsd / userPriceUsd) * 100).toFixed(1))
        : null,
  };
}

/**
 * 模型派生值的唯一入口：官方成本 → 毛利 → 健康 → 路由异常标记。
 * 服务端快照和客户端保存后的回算都必须走它，否则「改完价后页面显示的毛利」
 * 与「刷新后从库里算出来的毛利」会是两套结果。
 * 传入的 model 需带 routes（已装饰）与 legacyCostUsd。
 */
export function deriveModel(model, creditUsdRate) {
  const { costUsd, source } = officialCostOf({
    routes: model.routes,
    primaryChannelId: model.primaryChannelId,
    legacyCostUsd: model.legacyCostUsd,
  });
  const pricing = computePricing({
    providerCostUsd: costUsd,
    credits: model.credits,
    creditUsdRate,
  });
  const next = {
    ...model,
    ...pricing,
    officialCostUsd: costUsd,
    costSource: source,
    health: modelHealthState({ routes: model.routes }),
  };
  return { ...next, issues: modelRouteIssues(next) };
}

/** 由官方成本与目标倍率反推 Credits，用于定价弹窗的自动计算。 */
export function creditsFromMarkup({ providerCostUsd, markup, creditUsdRate }) {
  const rate = Number(creditUsdRate);
  const cost = Number(providerCostUsd);
  const target = Number(markup);
  if (!Number.isFinite(cost) || !Number.isFinite(target) || !(rate > 0)) return null;
  return Math.max(0, Math.ceil((cost * target) / rate));
}

/**
 * 一段窗口内的整体毛利率：真实 Credits 消耗折算收入 − 真实上游成本。
 * 上游成本全部为 0 说明计费链路没有落库（见 Backend Requirements），此时
 * 毛利率不可信，返回 null 交给界面渲染「—」，而不是报出一个假的 100%。
 */
export function aggregateMargin({ models = [], creditUsdRate, creditsKey, costKey }) {
  const rate = Number(creditUsdRate);
  if (!(rate > 0)) return null;
  let revenue = 0;
  let cost = 0;
  for (const model of models) {
    revenue += (Number(model?.[creditsKey]) || 0) * rate;
    cost += Number(model?.[costKey]) || 0;
  }
  if (revenue <= 0 || cost <= 0) return null;
  return Number((((revenue - cost) / revenue) * 100).toFixed(1));
}

/**
 * 「基于当前定价与默认供应商」的毛利率：不依赖有没有人真的调用过，
 * 只统计成本和 Credits 都已配置的模型，按各模型毛利率算。
 *
 * 这里同时给 mean 与 median：按次和按秒计费的模型单位成本差几个数量级，
 * 个别「售价远低于成本」的模型会把平均数拖到 -1000% 以上，只报一个数会误导。
 * sampleSize 必须一起返回：大量模型没有回填成本，只报一个百分比会让管理员
 * 以为整个目录的毛利都是这个数。样本为 0 时全部返回 null，界面渲染「—」。
 */
export function configuredMargin(models = []) {
  const rates = [];
  for (const model of models) {
    const unitCost = Number(model?.officialCostUsd);
    const unitRevenue = Number(model?.userPriceUsd);
    if (!Number.isFinite(unitCost) || unitCost <= 0) continue;
    if (!Number.isFinite(unitRevenue) || unitRevenue <= 0) continue;
    rates.push(((unitRevenue - unitCost) / unitRevenue) * 100);
  }
  if (!rates.length) return { marginRate: null, marginRateMedian: null, sampleSize: 0, pricedModels: 0 };
  const sorted = [...rates].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    marginRate: Number((rates.reduce((sum, rate) => sum + rate, 0) / rates.length).toFixed(1)),
    marginRateMedian: Number(median.toFixed(1)),
    sampleSize: rates.length,
    pricedModels: models.filter((model) => Number(model?.credits) > 0).length,
  };
}
