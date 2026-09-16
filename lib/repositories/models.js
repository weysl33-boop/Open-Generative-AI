import { query, queryOne, execute, nowIso } from '../db/index.js';

export async function listAllModels() {
  const res = await query(`
    SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order, metadata_json, created_at, updated_at
    FROM models_config
    ORDER BY sort_order ASC, created_at ASC
  `);
  return res.rows;
}

export async function listActiveModels() {
  const res = await query(`
    SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order, metadata_json
    FROM models_config
    WHERE is_active = TRUE
    ORDER BY sort_order ASC, created_at ASC
  `);
  return res.rows;
}

export async function getModelById(id) {
  return await queryOne(`
    SELECT id, provider, name, type, cost_usd, credits_price, is_active, sort_order, metadata_json, created_at, updated_at
    FROM models_config
    WHERE id = $1
  `, [id]);
}

export async function findModelByEndpointOrId(key) {
  if (!key) return null;
  const clean = String(key).trim().toLowerCase();
  // 1. 精确匹配 ID
  let row = await queryOne('SELECT * FROM models_config WHERE LOWER(id) = $1', [clean]);
  if (row) return row;
  // 2. 去掉后缀模糊匹配
  const baseKey = clean.replace(/-(image|video|audio|pro|fast)$/, '');
  row = await queryOne('SELECT * FROM models_config WHERE LOWER(id) = $1 OR LOWER(id) LIKE $2', [baseKey, `%${baseKey}%`]);
  return row || null;
}

export async function updateModelConfig(id, updates) {
  const existing = await getModelById(id);
  if (!existing) return null;

  const cost_usd = updates.cost_usd !== undefined ? Number(updates.cost_usd) : existing.cost_usd;
  const credits_price = updates.credits_price !== undefined ? Number(updates.credits_price) : existing.credits_price;
  const is_active = updates.is_active !== undefined ? Boolean(updates.is_active) : existing.is_active;
  const name = updates.name || existing.name;
  const sort_order = updates.sort_order !== undefined ? Number(updates.sort_order) : existing.sort_order;
  const timestamp = nowIso();

  await execute(`
    UPDATE models_config
    SET name = $1, cost_usd = $2, credits_price = $3, is_active = $4, sort_order = $5, updated_at = $6
    WHERE id = $7
  `, [name, cost_usd, credits_price, is_active, sort_order, timestamp, id]);

  return await getModelById(id);
}
