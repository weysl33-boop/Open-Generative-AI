import 'server-only';

import crypto from 'node:crypto';
import { execute, nowIso, queryMany, queryOne, randomId } from '../db/index.js';

const ENCRYPTION_ALGO = 'aes-256-gcm';

function getWrappingKey() {
  const secret = process.env.PROVIDER_SECRETS_ENCRYPTION_KEY
    || process.env.ADMIN_SECRET_KEY
    || process.env.BILLING_SESSION_SECRET
    || process.env.OAUTH_STATE_SECRET;
  if (!secret) {
    throw Object.assign(new Error('未配置 provider secret 加密密钥'), { code: 'PROVIDER_SECRET_KEY_REQUIRED' });
  }
  return crypto.createHash('sha256').update(secret).digest();
}

export async function saveProviderSecret({ provider, name, secretValue, transaction = null }) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, getWrappingKey(), iv);
  let ciphertext = cipher.update(secretValue, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const now = nowIso();
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await run(`
    INSERT INTO ops_bill.provider_secrets (provider, name, ciphertext, nonce, auth_tag, key_version, updated_at)
    VALUES ($1, $2, $3, $4, $5, 1, $6)
    ON CONFLICT (provider, name) DO UPDATE SET ciphertext = EXCLUDED.ciphertext,
      nonce = EXCLUDED.nonce, auth_tag = EXCLUDED.auth_tag, updated_at = EXCLUDED.updated_at
  `, [provider, name, ciphertext, iv.toString('hex'), cipher.getAuthTag().toString('hex'), now]);
  return { provider, name, updatedAt: now };
}

export async function hasProviderSecret(provider, name) {
  try {
    return Boolean(await queryOne('SELECT updated_at FROM ops_bill.provider_secrets WHERE provider = $1 AND name = $2', [provider, name]));
  } catch {
    return false;
  }
}

/**
 * 区分「没有这条密钥」与「读不出来」：密钥库抖动不能被上层当成商户未配置，
 * 否则一次连接故障会把可用的支付渠道判成永久不可用，并把真实原因抹掉。
 */
export async function readProviderSecret(provider, name) {
  let row;
  try {
    row = await queryOne('SELECT ciphertext, nonce, auth_tag FROM ops_bill.provider_secrets WHERE provider = $1 AND name = $2', [provider, name]);
  } catch (err) {
    console.error(`[provider_secrets] 读取 ${provider}:${name} 失败:`, err.message);
    return { status: 'error', value: null };
  }
  if (!row) return { status: 'absent', value: null };
  try {
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGO, getWrappingKey(), Buffer.from(row.nonce, 'hex'));
    decipher.setAuthTag(Buffer.from(row.auth_tag, 'hex'));
    return { status: 'ok', value: decipher.update(row.ciphertext, 'hex', 'utf8') + decipher.final('utf8') };
  } catch (err) {
    console.error(`[provider_secrets] 解密 ${provider}:${name} 失败:`, err.message);
    return { status: 'error', value: null };
  }
}

export async function getProviderSecret(provider, name) {
  return (await readProviderSecret(provider, name)).value;
}

export async function listProviderConfigs() {
  return queryMany('SELECT provider, kind, name, enabled, config_json, updated_at FROM ops_bill.provider_configs ORDER BY provider');
}

export async function recordHealthCheck({
  provider,
  status,
  latencyMs,
  errorCode = null,
  details = {},
  transaction = null,
}) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  const id = randomId('health');
  const now = nowIso();
  await run(`
    INSERT INTO ops_bill.provider_health_checks (id, provider, status, latency_ms, error_code, details_json, checked_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
  `, [id, provider, status, latencyMs, errorCode, JSON.stringify(details), now]);
  return { id, provider, status, latencyMs, checkedAt: now };
}

export async function recordProviderCall({ provider, action, orderId = null, requestId = null, status, latencyMs = null, errorCode = null, usage = {} }) {
  const id = randomId('pcl');
  await execute(`
    INSERT INTO provider_call_logs
      (id, provider, action, order_id, request_id, status, latency_ms, error_code, usage_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
  `, [id, provider, action, orderId, requestId, status, latencyMs || null, errorCode || null, JSON.stringify(usage || {}), nowIso()]);
  return id;
}

export async function getProviderSecretsMetadata(provider) {
  try {
    const rows = await queryMany(
      'SELECT name, updated_at FROM ops_bill.provider_secrets WHERE provider = $1',
      [provider]
    );
    return rows.map((r) => ({
      name: r.name,
      updatedAt: r.updated_at,
    }));
  } catch {
    return [];
  }
}

export async function getLatestHealthChecks() {
  return queryMany(`
    SELECT DISTINCT ON (provider) * FROM ops_bill.provider_health_checks
    ORDER BY provider, checked_at DESC
  `);
}

