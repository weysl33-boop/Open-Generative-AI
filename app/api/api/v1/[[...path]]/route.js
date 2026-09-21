import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { findCreationById } from '@/lib/services/generations';
import { guardMutation, consumeRateLimit, getClientIp, rateLimitResponse } from '@/lib/security/requestGuard';
import { validatePromptSafety } from '@/lib/security/contentModeration';
import { publicErrorMessage } from '@/lib/security/publicError';
import { getServerProviderApiKey } from '@/lib/services/providerSecrets';
import { findModelByEndpointOrId } from '@/lib/services/models';
import { classifyProxyRequest, isLocalCreationId, POLICY } from '@/lib/security/legacyProxyPolicy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MUAPI_BASE = 'https://api.muapi.ai';

// 轮询极频繁（生成期间每 2 秒一次，批量可 4 路并发），读限额需宽松；
// 生成调用直接消耗平台余额，必须限额。
const READ_LIMIT = { limit: 1200, windowMs: 60 * 1000 };
const GENERATE_BURST = { limit: 30, windowMs: 60 * 1000 };
const GENERATE_SUSTAINED = { limit: 300, windowMs: 60 * 60 * 1000 };

const DENY_MESSAGE = {
  [POLICY.DENY_ACCOUNT]: '该接口不对外开放，请使用平台账户与额度接口',
  [POLICY.DENY_BILLING_REQUIRED]: '该生成端点已停用，请通过平台生成接口创建并结算任务',
  [POLICY.DENY_PATH]: '该接口不可用',
};

function cleanHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host');
  headers.delete('connection');
  headers.delete('cookie');
  headers.delete('authorization');
  headers.delete('x-api-key');
  return headers;
}

function deny(decision, path) {
  console.warn('[legacy_proxy/denied]', JSON.stringify({ decision, path }));
  const status = decision === POLICY.DENY_PATH ? 404
    : decision === POLICY.DENY_BILLING_REQUIRED ? 402
      : 403;
  return NextResponse.json(
    { error: DENY_MESSAGE[decision] || '该接口不可用', code: decision },
    { status },
  );
}

// Async generation tasks are polled through the legacy agent path. Keep
// this local and ownership-checked instead of exposing provider requests.
async function handleLocalPrediction(user, pathSegments) {
  const creation = await findCreationById(pathSegments[1]);
  if (!creation || creation.user_id !== user.id) {
    return NextResponse.json({ error: '任务不存在' }, { status: 404 });
  }
  const status = creation.status === 'succeeded' ? 'completed'
    : creation.status === 'cancelled' ? 'cancelled'
      : creation.status;
  return NextResponse.json({
    id: creation.id,
    request_id: creation.id,
    status,
    url: creation.result_url || undefined,
    outputs: creation.result_url ? [creation.result_url] : undefined,
    error: creation.error_reason ? { message: creation.error_reason, code: creation.error_code } : undefined,
    cost: creation.status === 'failed' ? { refunded: true, amount_credits: Number(creation.credit_cost || 0) } : undefined,
  });
}

async function serverKeyOrNull() {
  // NOTE: credential logging removed for security (CWE-200)
  return getServerProviderApiKey({ provider: 'muapi' });
}

export async function GET(request, { params }) {
  const slug = await params;
  const pathSegments = slug.path || [];

  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });

  // 平台自有任务改走本地归属校验，不向上游发起任何请求。
  if (pathSegments.length === 3 && isLocalCreationId(pathSegments[1])) {
    return handleLocalPrediction(user, pathSegments);
  }

  const verdict = classifyProxyRequest(pathSegments, 'GET');
  if (!verdict.allow) return deny(verdict.decision, verdict.path);

  const limit = await consumeRateLimit({ scope: 'legacy_proxy_read', subject: user.id || getClientIp(request), ...READ_LIMIT });
  if (!limit.allowed) return rateLimitResponse(limit);

  const apiKey = await serverKeyOrNull();
  if (!apiKey) return NextResponse.json({ error: 'Provider 服务暂未配置' }, { status: 503 });

  const { search } = new URL(request.url);
  const headers = cleanHeaders(request);
  headers.set('x-api-key', apiKey);
  try {
    const response = await fetch(`${MUAPI_BASE}/api/v1/${verdict.path}${search}`, { headers, method: 'GET' });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, '上游请求异常') }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const slug = await params;
  const pathSegments = slug.path || [];

  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 256 * 1024 });
  if (guarded) return guarded;

  const resolved = pathSegments.length === 1
    ? await findModelByEndpointOrId(pathSegments[0]).catch(() => null)
    : null;
  const activeSlug = resolved?.is_active ? String(resolved.id).toLowerCase() : null;
  const verdict = classifyProxyRequest(pathSegments, 'POST', {
    isKnownGenerationEndpoint: (candidate) => String(candidate).toLowerCase() === activeSlug,
  });
  if (!verdict.allow) return deny(verdict.decision, verdict.path);

  const subject = user.id || getClientIp(request);
  const burst = await consumeRateLimit({ scope: 'legacy_proxy_generate', subject, ...GENERATE_BURST });
  if (!burst.allowed) return rateLimitResponse(burst);
  const sustained = await consumeRateLimit({ scope: 'legacy_proxy_generate_hourly', subject, ...GENERATE_SUSTAINED });
  if (!sustained.allowed) return rateLimitResponse(sustained);

  let payload;
  if (verdict.decision === POLICY.ALLOW_UTILITY) {
    payload = Buffer.from(await request.arrayBuffer());
  } else {
    payload = await request.text().catch(() => '');
    let parsed = null;
    try { parsed = payload ? JSON.parse(payload) : null; } catch { parsed = null; }
    const moderation = validatePromptSafety(parsed?.prompt);
    if (!moderation.passed) {
      return NextResponse.json({ error: moderation.reason, code: moderation.code }, { status: 422 });
    }
  }

  const apiKey = await serverKeyOrNull();
  if (!apiKey) return NextResponse.json({ error: 'Provider 服务暂未配置' }, { status: 503 });

  const { search } = new URL(request.url);
  const headers = cleanHeaders(request);
  headers.set('x-api-key', apiKey);
  try {
    const response = await fetch(`${MUAPI_BASE}/api/v1/${verdict.path}${search}`, { method: 'POST', headers, body: payload });
    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    return NextResponse.json({ error: publicErrorMessage(error, '上游请求异常') }, { status: 500 });
  }
}
