import 'server-only';

import * as analyticsRepo from '../repositories/analyticsFinancial.js';
import { resolveCreditValuation } from './creditValuation.js';

/**
 * 成本中心（Cost Center）数据分析
 */
export async function getCostCenterAnalytics({
  startDate = null,
  endDate = null,
  modelId = null,
  providerId = null,
} = {}) {
  const valuation = await resolveCreditValuation();
  const { kpiRow, providersBreakdown, modelsBreakdown, dailyTrends, topErrors } = await analyticsRepo.getCostCenterRows({
    startDate, endDate, modelId, providerId,
  });

  const totalCalls = Number(kpiRow?.total_calls || 0);
  const successCalls = Number(kpiRow?.success_calls || 0);
  const failedCalls = Number(kpiRow?.failed_calls || 0);
  const successRate = totalCalls > 0 ? Number(((successCalls / totalCalls) * 100).toFixed(1)) : 100;
  const avgLatencyMs = Number(kpiRow?.avg_latency_ms || 0);
  const totalCostUsd = Number(kpiRow?.total_cost_usd || 0);
  const totalCostCny = Number((totalCostUsd * valuation.usdToCnyRate).toFixed(4));

  return {
    summary: {
      totalCalls,
      successCalls,
      failedCalls,
      successRate,
      avgLatencyMs,
      totalCostUsd: Number(totalCostUsd.toFixed(4)),
      totalCostCny: Number(totalCostCny.toFixed(4)),
    },
    providers: providersBreakdown.map((r) => {
      const calls = Number(r.total_calls || 0);
      const sc = Number(r.success_calls || 0);
      const cost = Number(Number(r.total_cost_usd || 0).toFixed(4));
      return {
        providerId: r.provider_id,
        providerName: r.provider_name,
        providerType: r.provider_type,
        totalCalls: calls,
        successCalls: sc,
        failedCalls: Number(r.failed_calls || 0),
        successRate: calls > 0 ? Number(((sc / calls) * 100).toFixed(1)) : 100,
        avgLatencyMs: Number(r.avg_latency_ms || 0),
        totalCostUsd: cost,
        totalCostCny: Number((cost * valuation.usdToCnyRate).toFixed(4)),
      };
    }),
    models: modelsBreakdown.map((r) => {
      const calls = Number(r.total_calls || 0);
      const sc = Number(r.success_calls || 0);
      const cost = Number(Number(r.total_cost_usd || 0).toFixed(4));
      return {
        modelId: r.model_id,
        modelName: r.model_name,
        totalCalls: calls,
        successCalls: sc,
        successRate: calls > 0 ? Number(((sc / calls) * 100).toFixed(1)) : 100,
        totalCostUsd: cost,
        totalCostCny: Number((cost * valuation.usdToCnyRate).toFixed(4)),
      };
    }),
    dailyTrends: dailyTrends.map((d) => ({
      date: d.date,
      totalCalls: Number(d.total_calls || 0),
      successCalls: Number(d.success_calls || 0),
      costUsd: Number(Number(d.cost_usd || 0).toFixed(4)),
      costCny: Number((Number(d.cost_usd || 0) * valuation.usdToCnyRate).toFixed(4)),
    })),
    topErrors: topErrors.map((e) => ({
      errorCode: e.error_code,
      count: Number(e.error_count || 0),
    })),
  };
}

/**
 * 利润中心（Profit Center）数据分析
 */
export async function getProfitCenterAnalytics({
  startDate = null,
  endDate = null,
  modelId = null,
} = {}) {
  const valuation = await resolveCreditValuation();
  const { modelProfits, dailyProfits } = await analyticsRepo.getProfitCenterRows({ startDate, endDate, modelId });

  let platformCreditsConsumed = 0;
  let platformRevenueUsd = 0;
  let platformCostUsd = 0;
  let alertCount = 0;

  const modelsList = modelProfits.map((row) => {
    const credits = Number(row.total_credits_consumed || 0);
    const costUsd = Number(Number(row.total_real_cost_usd || 0).toFixed(4));
    const revenueUsd = Number((credits * valuation.usdPerCredit).toFixed(4));
    const grossProfitUsd = Number((revenueUsd - costUsd).toFixed(4));
    const marginRate = revenueUsd > 0 ? Number(((grossProfitUsd / revenueUsd) * 100).toFixed(1)) : 0;
    const minMarginRate = Number((Number(row.min_margin_rate || 0.3) * 100).toFixed(1));
    const isAlert = marginRate < minMarginRate;

    if (isAlert) alertCount++;
    platformCreditsConsumed += credits;
    platformRevenueUsd += revenueUsd;
    platformCostUsd += costUsd;

    return {
      modelId: row.model_id,
      modelName: row.model_name,
      category: row.category,
      totalGenerations: Number(row.total_generations || 0),
      creditsConsumed: credits,
      revenueUsd,
      revenueCny: Number((revenueUsd * valuation.usdToCnyRate).toFixed(2)),
      costUsd,
      costCny: Number((costUsd * valuation.usdToCnyRate).toFixed(2)),
      grossProfitUsd,
      grossProfitCny: Number((grossProfitUsd * valuation.usdToCnyRate).toFixed(2)),
      grossMarginRate: marginRate,
      minGrossMarginRate: minMarginRate,
      isMarginAlert: isAlert,
    };
  });

  const platformGrossProfitUsd = Number((platformRevenueUsd - platformCostUsd).toFixed(4));
  const platformMarginRate = platformRevenueUsd > 0
    ? Number(((platformGrossProfitUsd / platformRevenueUsd) * 100).toFixed(1))
    : 0;

  return {
    summary: {
      totalCreditsConsumed: platformCreditsConsumed,
      revenueUsd: Number(platformRevenueUsd.toFixed(2)),
      revenueCny: Number((platformRevenueUsd * valuation.usdToCnyRate).toFixed(2)),
      costUsd: Number(platformCostUsd.toFixed(2)),
      costCny: Number((platformCostUsd * valuation.usdToCnyRate).toFixed(2)),
      grossProfitUsd: Number(platformGrossProfitUsd.toFixed(2)),
      grossProfitCny: Number((platformGrossProfitUsd * valuation.usdToCnyRate).toFixed(2)),
      grossMarginRate: platformMarginRate,
      marginAlertCount: alertCount,
    },
    models: modelsList,
    dailyTrends: dailyProfits.map((d) => {
      const credits = Number(d.credits_consumed || 0);
      const rev = Number((credits * valuation.usdPerCredit).toFixed(4));
      const cost = Number(Number(d.cost_usd || 0).toFixed(4));
      const profit = Number((rev - cost).toFixed(4));
      const rate = rev > 0 ? Number(((profit / rev) * 100).toFixed(1)) : 0;
      return {
        date: d.date,
        totalGenerations: Number(d.total_generations || 0),
        creditsConsumed: credits,
        revenueUsd: rev,
        costUsd: cost,
        grossProfitUsd: profit,
        grossMarginRate: rate,
      };
    }),
  };
}
