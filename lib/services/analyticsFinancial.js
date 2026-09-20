import 'server-only';

import { queryMany, queryOne } from '../db/index.js';

const USD_TO_CNY_RATE = 7.2;
const CREDITS_PER_USD = 100; // 100 Credits = $1.00 USD (每个 Credit = $0.01)

/**
 * 成本中心（Cost Center）数据分析
 */
export async function getCostCenterAnalytics({
  startDate = null,
  endDate = null,
  modelId = null,
  providerId = null,
} = {}) {
  const whereClauses = ['1=1'];
  const params = [];
  let pIdx = 0;

  if (startDate) {
    whereClauses.push(`att.created_at >= $${++pIdx}::timestamptz`);
    params.push(startDate);
  }
  if (endDate) {
    whereClauses.push(`att.created_at <= $${++pIdx}::timestamptz`);
    params.push(endDate);
  }
  if (modelId) {
    whereClauses.push(`pm.model_id = $${++pIdx}`);
    params.push(modelId);
  }
  if (providerId) {
    whereClauses.push(`att.provider_id = $${++pIdx}`);
    params.push(providerId);
  }

  const whereSql = whereClauses.join(' AND ');

  // 1. 总体指标 KPI
  const kpiRow = await queryOne(`
    SELECT
      COUNT(att.id) AS total_calls,
      COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_calls,
      COALESCE(SUM(CASE WHEN att.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_calls,
      COALESCE(ROUND(AVG(att.duration_ms)), 0) AS avg_latency_ms,
      COALESCE(SUM(cr.actual_cost_usd), 0) AS total_cost_usd
    FROM ai_studio.generation_attempts att
    LEFT JOIN ai_studio.provider_models pm ON pm.id = att.provider_model_id
    LEFT JOIN ai_studio.provider_cost_records cr ON cr.attempt_id = att.id
    WHERE ${whereSql}
  `, params);

  const totalCalls = Number(kpiRow?.total_calls || 0);
  const successCalls = Number(kpiRow?.success_calls || 0);
  const failedCalls = Number(kpiRow?.failed_calls || 0);
  const successRate = totalCalls > 0 ? Number(((successCalls / totalCalls) * 100).toFixed(1)) : 100;
  const avgLatencyMs = Number(kpiRow?.avg_latency_ms || 0);
  const totalCostUsd = Number(kpiRow?.total_cost_usd || 0);
  const totalCostCny = Number((totalCostUsd * USD_TO_CNY_RATE).toFixed(4));

  // 2. 按供应商汇总
  const providersBreakdown = await queryMany(`
    SELECT
      p.id AS provider_id,
      p.name AS provider_name,
      p.provider_type,
      COUNT(att.id) AS total_calls,
      COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_calls,
      COALESCE(SUM(CASE WHEN att.status = 'failed' THEN 1 ELSE 0 END), 0) AS failed_calls,
      COALESCE(ROUND(AVG(att.duration_ms)), 0) AS avg_latency_ms,
      COALESCE(SUM(cr.actual_cost_usd), 0) AS total_cost_usd
    FROM ai_studio.generation_attempts att
    JOIN ai_studio.ai_providers p ON p.id = att.provider_id
    LEFT JOIN ai_studio.provider_models pm ON pm.id = att.provider_model_id
    LEFT JOIN ai_studio.provider_cost_records cr ON cr.attempt_id = att.id
    WHERE ${whereSql}
    GROUP BY p.id, p.name, p.provider_type
    ORDER BY total_cost_usd DESC, total_calls DESC
  `, params);

  // 3. 按模型汇总
  const modelsBreakdown = await queryMany(`
    SELECT
      COALESCE(m.id, pm.model_id, 'unknown') AS model_id,
      COALESCE(m.display_name, m.name, pm.model_id, '未知模型') AS model_name,
      COUNT(att.id) AS total_calls,
      COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_calls,
      COALESCE(SUM(cr.actual_cost_usd), 0) AS total_cost_usd
    FROM ai_studio.generation_attempts att
    LEFT JOIN ai_studio.provider_models pm ON pm.id = att.provider_model_id
    LEFT JOIN ai_studio.ai_models m ON m.id = pm.model_id
    LEFT JOIN ai_studio.provider_cost_records cr ON cr.attempt_id = att.id
    WHERE ${whereSql}
    GROUP BY COALESCE(m.id, pm.model_id, 'unknown'), COALESCE(m.display_name, m.name, pm.model_id, '未知模型')
    ORDER BY total_cost_usd DESC, total_calls DESC
  `, params);

  // 4. 每日趋势 (最近 14 天)
  const dailyTrends = await queryMany(`
    SELECT
      TO_CHAR(att.created_at, 'YYYY-MM-DD') AS date,
      COUNT(att.id) AS total_calls,
      COALESCE(SUM(CASE WHEN att.status = 'succeeded' THEN 1 ELSE 0 END), 0) AS success_calls,
      COALESCE(SUM(cr.actual_cost_usd), 0) AS cost_usd
    FROM ai_studio.generation_attempts att
    LEFT JOIN ai_studio.provider_models pm ON pm.id = att.provider_model_id
    LEFT JOIN ai_studio.provider_cost_records cr ON cr.attempt_id = att.id
    WHERE ${whereSql}
    GROUP BY TO_CHAR(att.created_at, 'YYYY-MM-DD')
    ORDER BY date ASC
  `, params);

  // 5. 错误分类排查
  const topErrors = await queryMany(`
    SELECT
      COALESCE(att.error_code, 'UNKNOWN_ERROR') AS error_code,
      COUNT(*) AS error_count
    FROM ai_studio.generation_attempts att
    LEFT JOIN ai_studio.provider_models pm ON pm.id = att.provider_model_id
    WHERE ${whereSql} AND att.status = 'failed'
    GROUP BY COALESCE(att.error_code, 'UNKNOWN_ERROR')
    ORDER BY error_count DESC
    LIMIT 10
  `, params);

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
        totalCostCny: Number((cost * USD_TO_CNY_RATE).toFixed(4)),
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
        totalCostCny: Number((cost * USD_TO_CNY_RATE).toFixed(4)),
      };
    }),
    dailyTrends: dailyTrends.map((d) => ({
      date: d.date,
      totalCalls: Number(d.total_calls || 0),
      successCalls: Number(d.success_calls || 0),
      costUsd: Number(Number(d.cost_usd || 0).toFixed(4)),
      costCny: Number((Number(d.cost_usd || 0) * USD_TO_CNY_RATE).toFixed(4)),
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
  const whereClauses = ['c.status = \'succeeded\''];
  const params = [];
  let pIdx = 0;

  if (startDate) {
    whereClauses.push(`c.created_at >= $${++pIdx}::timestamptz`);
    params.push(startDate);
  }
  if (endDate) {
    whereClauses.push(`c.created_at <= $${++pIdx}::timestamptz`);
    params.push(endDate);
  }
  if (modelId) {
    whereClauses.push(`c.model = $${++pIdx}`);
    params.push(modelId);
  }

  const whereSql = whereClauses.join(' AND ');

  // 1. 各模型收益与成本分布
  const modelProfits = await queryMany(`
    SELECT
      c.model AS model_id,
      COALESCE(m.display_name, m.name, c.model) AS model_name,
      COALESCE(m.category, 'image') AS category,
      COUNT(c.id) AS total_generations,
      COALESCE(SUM(c.credit_cost), 0) AS total_credits_consumed,
      COALESCE(SUM(cr.actual_cost_usd), 0) AS total_real_cost_usd,
      COALESCE(mp.min_gross_margin_rate, 0.30) AS min_margin_rate
    FROM ai_studio.creations c
    LEFT JOIN ai_studio.ai_models m ON m.id = c.model
    LEFT JOIN ai_studio.model_pricing mp ON mp.model_id = c.model
    LEFT JOIN ai_studio.provider_cost_records cr ON cr.job_id = c.id
    WHERE ${whereSql}
    GROUP BY c.model, COALESCE(m.display_name, m.name, c.model), COALESCE(m.category, 'image'), mp.min_gross_margin_rate
    ORDER BY total_credits_consumed DESC
  `, params);

  let platformCreditsConsumed = 0;
  let platformRevenueUsd = 0;
  let platformCostUsd = 0;
  let alertCount = 0;

  const modelsList = modelProfits.map((row) => {
    const credits = Number(row.total_credits_consumed || 0);
    const costUsd = Number(Number(row.total_real_cost_usd || 0).toFixed(4));
    const revenueUsd = Number((credits / CREDITS_PER_USD).toFixed(4));
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
      revenueCny: Number((revenueUsd * USD_TO_CNY_RATE).toFixed(2)),
      costUsd,
      costCny: Number((costUsd * USD_TO_CNY_RATE).toFixed(2)),
      grossProfitUsd,
      grossProfitCny: Number((grossProfitUsd * USD_TO_CNY_RATE).toFixed(2)),
      grossMarginRate: marginRate,
      minGrossMarginRate: minMarginRate,
      isMarginAlert: isAlert,
    };
  });

  const platformGrossProfitUsd = Number((platformRevenueUsd - platformCostUsd).toFixed(4));
  const platformMarginRate = platformRevenueUsd > 0
    ? Number(((platformGrossProfitUsd / platformRevenueUsd) * 100).toFixed(1))
    : 0;

  // 2. 每日利润趋势
  const dailyProfits = await queryMany(`
    SELECT
      TO_CHAR(c.created_at, 'YYYY-MM-DD') AS date,
      COUNT(c.id) AS total_generations,
      COALESCE(SUM(c.credit_cost), 0) AS credits_consumed,
      COALESCE(SUM(cr.actual_cost_usd), 0) AS cost_usd
    FROM ai_studio.creations c
    LEFT JOIN ai_studio.provider_cost_records cr ON cr.job_id = c.id
    WHERE ${whereSql}
    GROUP BY TO_CHAR(c.created_at, 'YYYY-MM-DD')
    ORDER BY date ASC
  `, params);

  return {
    summary: {
      totalCreditsConsumed: platformCreditsConsumed,
      revenueUsd: Number(platformRevenueUsd.toFixed(2)),
      revenueCny: Number((platformRevenueUsd * USD_TO_CNY_RATE).toFixed(2)),
      costUsd: Number(platformCostUsd.toFixed(2)),
      costCny: Number((platformCostUsd * USD_TO_CNY_RATE).toFixed(2)),
      grossProfitUsd: Number(platformGrossProfitUsd.toFixed(2)),
      grossProfitCny: Number((platformGrossProfitUsd * USD_TO_CNY_RATE).toFixed(2)),
      grossMarginRate: platformMarginRate,
      marginAlertCount: alertCount,
    },
    models: modelsList,
    dailyTrends: dailyProfits.map((d) => {
      const credits = Number(d.credits_consumed || 0);
      const rev = Number((credits / CREDITS_PER_USD).toFixed(4));
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
