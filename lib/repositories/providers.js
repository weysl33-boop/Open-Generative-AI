import 'server-only';

import crypto from 'node:crypto';
import { execute, nowIso, queryMany, queryOne, randomId } from '../db/index.js';

const ENCRYPTION_ALGO = 'aes-256-gcm';

function getWrappingKey() {
  const secret = process.env.ADMIN_SECRET_KEY;
  if (!secret) throw new Error('ADMIN_SECRET_KEY is required to store provider secrets.');
  return crypto.createHash('sha256').update(secret).digest();
}

export async function saveProviderSecret({ provider, name, secretValue }) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGO, getWrappingKey(), iv);
  let ciphertext = cipher.update(secretValue, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const now = nowIso();
  await execute(`
    INSERT INTO provider_secrets (provider, name, ciphertext, nonce, auth_tag, key_version, updated_at)
    VALUES ($1, $2, $3, $4, $5, 1, $6)
    ON CONFLICT (provider, name) DO UPDATE SET ciphertext = EXCLUDED.ciphertext,
      nonce = EXCLUDED.nonce, auth_tag = EXCLUDED.auth_tag, updated_at = EXCLUDED.updated_at
  `, [provider, name, ciphertext, iv.toString('hex'), cipher.getAuthTag().toString('hex'), now]);
  return { provider, name, updatedAt: now };
}

export async function hasProviderSecret(provider, name) {
  return Boolean(await queryOne('SELECT updated_at FROM provider_secrets WHERE provider = $1 AND name = $2', [provider, name]));
}

export async function listProviderConfigs() {
  return queryMany('SELECT provider, kind, name, enabled, config_json, updated_at FROM provider_configs ORDER BY provider');
}

export async function recordHealthCheck({ provider, status, latencyMs, errorCode = null, details = {} }) {
  const id = randomId('health');
  const now = nowIso();
  await execute(`
    INSERT INTO provider_health_checks (id, provider, status, latency_ms, error_code, details_json, checked_at)
    VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
  `, [id, provider, status, latencyMs, errorCode, JSON.stringify(details), now]);
  return { id, provider, status, latencyMs, checkedAt: now };
}

export async function getLatestHealthChecks() {
  return queryMany(`
    SELECT DISTINCT ON (provider) * FROM provider_health_checks
    ORDER BY provider, checked_at DESC
  `);
}
