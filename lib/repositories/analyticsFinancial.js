import { queryMany, queryOne } from '../db/index.js';

function filteredWhere({ startDate = null, endDate = null, modelId = null, providerId = null } = {}, { profit = false } = {}) {
  const clauses = profit ? ["c.status = 'succeeded'"] : ['1=1'];
  const params = [];
  let index = 0;
  const next = () => `$${++index}`;

  if (startDate) {
    clauses.push(`${profit ? 'c' : 'att'}.created_at >= ${next()}::timestamptz`);
    params.push(startDate);
  }
  if (endDate) {
    clauses.push(`${profit ? 'c' : 'att'}.created_at <= ${next()}::timestamptz`);
    params.push(endDate);
  }
  if (modelId) {
    clauses.push(`${profit ? 'c.model' : 'pm.model_id'} = ${next()}`);
    params.push(modelId);
  }
  if (providerId && !profit) {
    clauses.push(`att.provider_id = ${next()}`);
    params.push(providerId);
  }
  return { whereSql: clauses.join(' AND '), params };
}

export async function getCostCenterRows(filters = {}) {
  const { whereSql, params } = filteredWhere(filters);
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
  const providersBreakdown = await queryMany(`
    SELECT p.id AS provider_id, p.name AS provider_name, p.provider_type,
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
  const modelsBreakdown = await queryMany(`
    SELECT COALESCE(m.id, pm.model_id, 'unknown') AS model_id,
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
  const dailyTrends = await queryMany(`
    SELECT TO_CHAR(att.created_at, 'YYYY-MM-DD') AS date,
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
  const topErrors = await queryMany(`
    SELECT COALESCE(att.error_code, 'UNKNOWN_ERROR') AS error_code, COUNT(*) AS error_count
    FROM ai_studio.generation_attempts att
    LEFT JOIN ai_studio.provider_models pm ON pm.id = att.provider_model_id
    WHERE ${whereSql} AND att.status = 'failed'
    GROUP BY COALESCE(att.error_code, 'UNKNOWN_ERROR')
    ORDER BY error_count DESC LIMIT 10
  `, params);
  return { kpiRow, providersBreakdown, modelsBreakdown, dailyTrends, topErrors };
}

export async function getProfitCenterRows(filters = {}) {
  const { whereSql, params } = filteredWhere(filters, { profit: true });
  const modelProfits = await queryMany(`
    SELECT c.model AS model_id,
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
  const dailyProfits = await queryMany(`
    SELECT TO_CHAR(c.created_at, 'YYYY-MM-DD') AS date,
      COUNT(c.id) AS total_generations,
      COALESCE(SUM(c.credit_cost), 0) AS credits_consumed,
      COALESCE(SUM(cr.actual_cost_usd), 0) AS cost_usd
    FROM ai_studio.creations c
    LEFT JOIN ai_studio.provider_cost_records cr ON cr.job_id = c.id
    WHERE ${whereSql}
    GROUP BY TO_CHAR(c.created_at, 'YYYY-MM-DD')
    ORDER BY date ASC
  `, params);
  return { modelProfits, dailyProfits };
}
