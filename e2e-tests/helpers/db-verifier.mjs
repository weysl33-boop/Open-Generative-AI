/**
 * E2E Test Suite - Direct Database Verifier
 * 遵循 Opaque-box 黑盒测试原则，用于端到端执行后的权威数据落盘核验
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

function loadLocalEnv() {
  if (process.env.DATABASE_URL) return;
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx > 0) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim();
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

loadLocalEnv();

let pool = null;

export function getDbPool() {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error('[db-verifier] DATABASE_URL 未配置，无法直连数据库');
    }
    pool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pool;
}

export async function closeDbPool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query(sql, params = []) {
  const p = getDbPool();
  const res = await p.query(sql, params);
  return res.rows;
}

export async function queryOne(sql, params = []) {
  const rows = await query(sql, params);
  return rows[0] || null;
}

export async function execute(sql, params = []) {
  const p = getDbPool();
  const res = await p.query(sql, params);
  return res.rowCount || 0;
}

export async function withTransaction(callback) {
  const p = getDbPool();
  const client = await p.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// ---------------- 领域数据直连校验助手 ----------------

export async function getSchemaMigrations() {
  return query(`
    SELECT version, checksum, applied_at
    FROM sys_core.schema_migrations
    ORDER BY version ASC
  `);
}

export async function getUserByEmail(email) {
  return queryOne('SELECT * FROM users WHERE email = $1', [email]);
}

export async function getUserById(id) {
  return queryOne('SELECT * FROM users WHERE id = $1', [id]);
}

export async function getUserCredits(userId) {
  const user = await getUserById(userId);
  const ledgerSum = await queryOne(`
    SELECT COALESCE(SUM(delta), 0) AS total_delta
    FROM credit_ledger_v2
    WHERE user_id = $1
  `, [userId]);

  return {
    userCredits: user ? Number(user.credits) : 0,
    ledgerSum: Number(ledgerSum?.total_delta || 0),
  };
}

export async function getCreditLedgerEntries(userId) {
  return query(`
    SELECT *
    FROM credit_ledger_v2
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC
  `, [userId]);
}

export async function getCreditReservations(userId) {
  return query(`
    SELECT *
    FROM credit_reservations
    WHERE user_id = $1
    ORDER BY created_at DESC, id DESC
  `, [userId]);
}

export async function getCreationById(id) {
  return queryOne('SELECT * FROM creations WHERE id = $1', [id]);
}

export async function getGenerationEvents(creationId) {
  return query(`
    SELECT *
    FROM generation_events
    WHERE creation_id = $1
    ORDER BY created_at ASC, id ASC
  `, [creationId]);
}

export async function getAuditLogs({ targetType, targetId, action, limit = 20 } = {}) {
  const conditions = [];
  const params = [];
  let pIdx = 1;

  if (targetType) {
    conditions.push(`target_type = $${pIdx++}`);
    params.push(targetType);
  }
  if (targetId) {
    conditions.push(`target_id = $${pIdx++}`);
    params.push(targetId);
  }
  if (action) {
    conditions.push(`action = $${pIdx++}`);
    params.push(action);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  return query(`
    SELECT *
    FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT $${pIdx}
  `, params);
}

export async function getWebhookEvent(eventId) {
  return queryOne('SELECT * FROM webhook_events WHERE event_id = $1', [eventId]);
}

export async function getOrderById(orderId) {
  return queryOne('SELECT * FROM orders WHERE id = $1', [orderId]);
}

export async function getPaymentLedgerEntries(orderId) {
  return query('SELECT * FROM payment_ledger WHERE order_id = $1 ORDER BY created_at ASC', [orderId]);
}

export async function getSubscription(userId) {
  return queryOne('SELECT * FROM subscriptions WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 1', [userId]);
}

export async function getCommunityPostById(id) {
  return queryOne('SELECT * FROM community_posts WHERE id = $1', [id]);
}

export async function listActiveModels() {
  return query('SELECT * FROM models_config WHERE is_active = TRUE ORDER BY id ASC');
}

export async function seedTestUserAndSession({
  id = null,
  email = null,
  credits = 10,
  role = 'user',
  status = 'active',
} = {}) {
  const crypto = await import('node:crypto');
  const userId = id || `usr_e2e_${crypto.randomBytes(6).toString('hex')}`;
  const userEmail = email || `e2e_seed_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@koyosim.test`;
  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expires = new Date(Date.now() + 30 * 86400000).toISOString();
  const now = new Date().toISOString();

  await execute(`
    INSERT INTO users (id, email, display_name, role, credits, status, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  `, [userId, userEmail, userEmail.split('@')[0], role, credits, status, now, now]);

  await execute(`
    INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
    VALUES ($1, $2, $3, $4)
  `, [tokenHash, userId, expires, now]);

  return { id: userId, email: userEmail, credits, token, cookie: `ko_session=${token}` };
}

export async function cleanupTestData(testPrefix) {
  if (!testPrefix) return;
  const pattern = `%${testPrefix}%`;
  await execute('DELETE FROM payment_ledger WHERE order_id IN (SELECT id FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1))', [pattern]);
  await execute('DELETE FROM orders WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [pattern]);
  await execute('DELETE FROM generation_events WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [pattern]);
  await execute('DELETE FROM creations WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [pattern]);
  await execute('DELETE FROM credit_reservations WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [pattern]);
  await execute('DELETE FROM credit_ledger_v2 WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [pattern]);
  await execute('DELETE FROM subscriptions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [pattern]);
  await execute('DELETE FROM community_posts WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [pattern]);
  await execute('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE $1)', [pattern]);
  await execute('DELETE FROM users WHERE email LIKE $1', [pattern]);
  await execute('DELETE FROM webhook_events WHERE event_id LIKE $1', [pattern]);
}
