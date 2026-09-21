import 'server-only';

import crypto from 'node:crypto';
import { execute, nowIso, queryOne } from '../db/index.js';

function hashKey(key) { return crypto.createHash('sha256').update(String(key || '')).digest('hex'); }

export function getRequiredIdempotencyKey(request) {
  const value = String(request?.headers?.get?.('idempotency-key') || '').trim();
  return value.length >= 8 && value.length <= 200 ? value : null;
}

export async function checkIdempotency({ scope, key, actorId }) {
  if (!key) return { allowed: true, keyHash: null };
  const keyHash = hashKey(`${scope}:${actorId}:${key}`);
  const now = nowIso();
  await execute('DELETE FROM idempotency_keys WHERE expires_at < $1', [now]);
  const inserted = await queryOne(`
    INSERT INTO idempotency_keys (key_hash, scope, actor_id, status, created_at, expires_at)
    VALUES ($1, $2, $3, 'processing', $4, $5)
    ON CONFLICT (key_hash) DO NOTHING
    RETURNING key_hash
  `, [keyHash, scope, actorId, now, new Date(Date.now() + 86400000).toISOString()]);
  if (inserted) return { allowed: true, keyHash };

  const existing = await queryOne('SELECT key_hash, status, response_json, expires_at FROM idempotency_keys WHERE key_hash = $1', [keyHash]);
  if (existing?.status === 'completed' && existing.response_json) {
    return { allowed: false, cachedResponse: typeof existing.response_json === 'string' ? JSON.parse(existing.response_json) : existing.response_json, keyHash };
  }
  return { allowed: false, inProgress: true, keyHash };
}

export async function completeIdempotency(keyHash, responseData) {
  if (!keyHash) return;
  await execute("UPDATE idempotency_keys SET status = 'completed', response_json = $1::jsonb WHERE key_hash = $2", [JSON.stringify(responseData), keyHash]);
}

export async function releaseIdempotency(keyHash) {
  if (!keyHash) return;
  await execute('DELETE FROM idempotency_keys WHERE key_hash = $1 AND status = \'processing\'', [keyHash]);
}
