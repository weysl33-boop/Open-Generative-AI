import crypto from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { execute, queryOne } from '../db/index.js';

const DEFAULT_MAX_JSON_BYTES = 256 * 1024;

function safeOrigin(value) {
  try {
    const url = new URL(String(value || ''));
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function getClientIp(request) {
  const forwarded = request?.headers?.get?.('x-forwarded-for');
  const firstForwarded = forwarded?.split(',')[0]?.trim();
  return firstForwarded || request?.headers?.get?.('x-real-ip')?.trim() || 'unknown';
}

/**
 * Cookie-authenticated mutations must originate from this application.
 * In development/test, a missing Origin is allowed for CLI and integration
 * clients; a supplied mismatching Origin is never allowed. Production can
 * explicitly disable the missing-Origin compatibility with CSRF_ORIGIN_REQUIRED=false.
 */
function getRootDomain(hostname) {
  if (!hostname) return '';
  const parts = hostname.toLowerCase().split('.');
  if (parts.length <= 2) return hostname.toLowerCase();
  return parts.slice(-2).join('.');
}

function isOriginAllowed(supplied, trusted, request) {
  if (!supplied || !trusted) return false;
  if (supplied === trusted) return true;
  try {
    const sUrl = new URL(supplied);
    const tUrl = new URL(trusted);
    // 1. 同根域名允许（例如 koyosim.com 与 www.koyosim.com）
    if (getRootDomain(sUrl.hostname) === getRootDomain(tUrl.hostname) && sUrl.hostname.includes('koyosim.com')) {
      return true;
    }
    // 2. 本地开发环境互通
    const localHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
    if (localHosts.includes(sUrl.hostname) && localHosts.includes(tUrl.hostname)) {
      return true;
    }
    // 3. 检查与当前请求的 Host 头是否一致
    const reqHost = request?.headers?.get?.('x-forwarded-host') || request?.headers?.get?.('host');
    if (reqHost && (sUrl.host === reqHost || sUrl.hostname === reqHost.split(':')[0])) {
      return true;
    }
  } catch {}
  return false;
}

export function guardSameOrigin(request) {
  const origin = request?.headers?.get?.('origin')?.trim();
  const referer = request?.headers?.get?.('referer')?.trim();
  const suppliedOrigin = safeOrigin(origin || referer);
  const trustedOrigin = safeOrigin(process.env.PUBLIC_APP_URL) || safeOrigin(request?.nextUrl?.origin || request?.url);

  if (suppliedOrigin && trustedOrigin && !isOriginAllowed(suppliedOrigin, trustedOrigin, request)) {
    return NextResponse.json({ error: '请求来源无效' }, { status: 403 });
  }

  const required = process.env.CSRF_ORIGIN_REQUIRED !== 'false' && process.env.NODE_ENV === 'production';
  if (required && (!suppliedOrigin || !trustedOrigin)) {
    return NextResponse.json({ error: '请求缺少有效的来源校验' }, { status: 403 });
  }

  return null;
}

export function guardBodySize(request, maxBytes = DEFAULT_MAX_JSON_BYTES) {
  const contentLength = Number(request?.headers?.get?.('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return NextResponse.json({ error: '请求内容过大' }, { status: 413 });
  }
  return null;
}

export function guardMutation(request, { maxBytes = DEFAULT_MAX_JSON_BYTES } = {}) {
  const method = String(request?.method || 'GET').toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return null;
  return guardSameOrigin(request) || guardBodySize(request, maxBytes);
}

function rateLimitHash(scope, subject) {
  return crypto.createHash('sha256').update(`${scope}:${subject}`).digest('hex');
}

/**
 * PostgreSQL-backed fixed-window limiter. It is intentionally fail-closed:
 * if the limiter cannot be persisted, the caller receives an exception rather
 * than silently allowing an abuse-sensitive operation.
 */
export async function consumeRateLimit({ scope, subject, limit, windowMs }) {
  const cleanScope = String(scope || '').trim();
  const cleanSubject = String(subject || '').trim() || 'unknown';
  const max = Math.max(1, Number(limit) || 1);
  const duration = Math.max(1000, Number(windowMs) || 60_000);
  if (!cleanScope) throw new TypeError('rate limit scope is required');

  const now = new Date();
  const nowIso = now.toISOString();
  const resetThreshold = new Date(now.getTime() - duration).toISOString();
  const keyHash = rateLimitHash(cleanScope, cleanSubject);
  const row = await queryOne(`
    INSERT INTO sys_core.rate_limit_buckets
      (key_hash, scope, subject, window_started_at, request_count, updated_at)
    VALUES ($1, $2, $3, $4, 1, $4)
    ON CONFLICT (key_hash) DO UPDATE SET
      window_started_at = CASE
        WHEN sys_core.rate_limit_buckets.window_started_at <= $5 THEN $4
        ELSE sys_core.rate_limit_buckets.window_started_at
      END,
      request_count = CASE
        WHEN sys_core.rate_limit_buckets.window_started_at <= $5 THEN 1
        ELSE sys_core.rate_limit_buckets.request_count + 1
      END,
      updated_at = $4
    RETURNING request_count, window_started_at
  `, [keyHash, cleanScope, cleanSubject, nowIso, resetThreshold]);

  const requestCount = Number(row?.request_count || 0);
  const windowStartedAt = row?.window_started_at ? new Date(row.window_started_at).getTime() : now.getTime();
  return {
    allowed: requestCount <= max,
    limit: max,
    remaining: Math.max(0, max - requestCount),
    retryAfterSeconds: Math.max(1, Math.ceil((windowStartedAt + duration - now.getTime()) / 1000)),
  };
}

export async function purgeRateLimitBuckets(maxAgeMs = 2 * 86400000) {
  const cutoff = new Date(Date.now() - Math.max(60_000, Number(maxAgeMs) || 2 * 86400000)).toISOString();
  return execute('DELETE FROM sys_core.rate_limit_buckets WHERE updated_at < $1', [cutoff]);
}

export function rateLimitResponse(result) {
  return NextResponse.json(
    { error: '请求过于频繁，请稍后重试' },
    {
      status: 429,
      headers: {
        'Retry-After': String(result?.retryAfterSeconds || 60),
        'X-RateLimit-Limit': String(result?.limit || 1),
        'X-RateLimit-Remaining': String(result?.remaining || 0),
      },
    },
  );
}
