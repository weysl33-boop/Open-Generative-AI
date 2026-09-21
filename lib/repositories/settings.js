import { query, queryOne, execute, nowIso } from '../db/index.js';
import { parseFeaturesAndMeta, ensureCommercialPlans } from './plans.js';

export async function getAllSettings() {
  const res = await query(`
    SELECT key, value_json, updated_by, updated_at
    FROM system_settings
    ORDER BY key ASC
  `);

  return res.rows.map((r) => {
    let parsed = null;
    try {
      parsed = typeof r.value_json === 'string' ? JSON.parse(r.value_json) : r.value_json;
    } catch {
      parsed = r.value_json;
    }
    return {
      ...r,
      value: parsed,
    };
  });
}

export async function getSettingByKey(key, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const row = await run(`
    SELECT key, value_json, updated_by, updated_at
    FROM system_settings WHERE key = $1
  `, [key]);

  if (!row) return null;
  try {
    const val = typeof row.value_json === 'string' ? JSON.parse(row.value_json) : row.value_json;
    return { ...row, value: val };
  } catch {
    return { ...row, value: row.value_json };
  }
}

export async function updateSettingValue({ key, value, updatedBy, transaction = null }) {
  const now = nowIso();
  const jsonStr = JSON.stringify(value);
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;

  await run(`
    INSERT INTO system_settings (key, value_json, updated_by, updated_at)
    VALUES ($1, $2::jsonb, $3, $4)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `, [key, jsonStr, updatedBy, now]);

  return await getSettingByKey(key, transaction);
}

export async function getAllPlansConfig() {
  let res = await query(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config
    ORDER BY display_order ASC
  `);

  if (!res.rows.some((r) => r.id === 'starter')) {
    await ensureCommercialPlans();
    res = await query(`
      SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
      FROM plans_config
      ORDER BY display_order ASC
    `);
  }

  return res.rows.map((r) => {
    const { features, meta } = parseFeaturesAndMeta(r.features_json ?? r.features, r.id);
    return {
      ...r,
      features,
      meta,
      yearlyCny: meta.yearlyCny,
      yearlyUsd: meta.yearlyUsd,
      quotaBase: meta.quotaBase,
      quotaBonus: meta.quotaBonus,
      concurrency: meta.concurrency,
      asyncConcurrency: meta.asyncConcurrency,
      portraitCapacity: meta.portraitCapacity,
      badge: meta.badge,
    };
  });
}

export async function findPlanConfigById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const row = await run(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config WHERE id = $1
  `, [id]);

  if (!row) return null;
  const { features, meta } = parseFeaturesAndMeta(row.features_json ?? row.features, row.id);
  return {
    ...row,
    features,
    meta,
    yearlyCny: meta.yearlyCny,
    yearlyUsd: meta.yearlyUsd,
    quotaBase: meta.quotaBase,
    quotaBonus: meta.quotaBonus,
    concurrency: meta.concurrency,
    asyncConcurrency: meta.asyncConcurrency,
    portraitCapacity: meta.portraitCapacity,
    badge: meta.badge,
  };
}

export async function updatePlanConfig({ id, name, monthlyCny, monthlyUsd, features, meta, displayOrder, enabled, transaction = null }) {
  const now = nowIso();
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  
  // 组装存储结构：支持 features 数组与 meta 元数据
  const payloadToStore = meta ? { items: Array.isArray(features) ? features : [], meta } : (Array.isArray(features) ? features : []);

  await run(`
    UPDATE plans_config
    SET name = $1, monthly_cny = $2, monthly_usd = $3, features_json = $4::jsonb, display_order = $5, enabled = $6, updated_at = $7
    WHERE id = $8
  `, [
    name,
    monthlyCny,
    monthlyUsd,
    JSON.stringify(payloadToStore),
    displayOrder,
    Boolean(enabled),
    now,
    id
  ]);

  return await findPlanConfigById(id, transaction);
}
