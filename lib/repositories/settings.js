import { query, queryOne, execute, nowIso } from '../db/index.js';

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

export async function getSettingByKey(key) {
  const row = await queryOne(`
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

export async function updateSettingValue({ key, value, updatedBy }) {
  const now = nowIso();
  const jsonStr = JSON.stringify(value);

  await execute(`
    INSERT INTO system_settings (key, value_json, updated_by, updated_at)
    VALUES ($1, $2::jsonb, $3, $4)
    ON CONFLICT(key) DO UPDATE SET
      value_json = excluded.value_json,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at
  `, [key, jsonStr, updatedBy, now]);

  return await getSettingByKey(key);
}

export async function getAllPlansConfig() {
  const res = await query(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config
    ORDER BY display_order ASC
  `);

  return res.rows.map((r) => {
    let features = [];
    try {
      features = typeof r.features_json === 'string' ? JSON.parse(r.features_json) : (r.features_json || []);
    } catch {}
    return {
      ...r,
      features,
    };
  });
}

export async function findPlanConfigById(id) {
  const row = await queryOne(`
    SELECT id, name, monthly_cny, monthly_usd, features_json, display_order, enabled, updated_at
    FROM plans_config WHERE id = $1
  `, [id]);

  if (!row) return null;
  let features = [];
  try {
    features = typeof row.features_json === 'string' ? JSON.parse(row.features_json) : (row.features_json || []);
  } catch {}
  return {
    ...row,
    features,
  };
}

export async function updatePlanConfig({ id, name, monthlyCny, monthlyUsd, features, displayOrder, enabled }) {
  const now = nowIso();
  await execute(`
    UPDATE plans_config
    SET name = $1, monthly_cny = $2, monthly_usd = $3, features_json = $4::jsonb, display_order = $5, enabled = $6, updated_at = $7
    WHERE id = $8
  `, [
    name,
    monthlyCny,
    monthlyUsd,
    JSON.stringify(features || []),
    displayOrder,
    Boolean(enabled),
    now,
    id
  ]);

  return await findPlanConfigById(id);
}
