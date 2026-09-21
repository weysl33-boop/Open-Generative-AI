import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import { createGenerationTask, processGenerationTask } from '@/lib/services/generationCore';
import { findModelByEndpointOrId } from '@/lib/services/models';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { resolveProviderApiKey } from '@/lib/security/byok';
import { classifyProxyRequest, POLICY } from '@/lib/security/legacyProxyPolicy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UPSTREAM_BASE = process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai';

function cleanHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host'); headers.delete('connection'); headers.delete('cookie');
  headers.delete('authorization'); headers.delete('x-api-key');
  return headers;
}

export async function GET(request, context) {
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: '请先登录' }, { status: 401 });
  const { path: pathSegments = [] } = await context.params;

  // 此前 GET 分支会把任意上游路径用平台密钥签名转发：account/balance 因此把平台在
  // 供应商处的余额暴露给每个登录用户，其他账号类接口同理。改为只放行轮询与询价。
  const verdict = classifyProxyRequest(pathSegments, 'GET');
  if (!verdict.allow) {
    console.warn('[proxy/v1/denied]', JSON.stringify({ decision: verdict.decision, path: verdict.path }));
    return NextResponse.json(
      { error: '该接口不可用', code: verdict.decision },
      { status: verdict.decision === POLICY.DENY_ACCOUNT ? 403 : 404 },
    );
  }

  const limit = await consumeRateLimit({ scope: 'proxy_v1_read', subject: user.id || getClientIp(request), limit: 1200, windowMs: 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const targetUrl = `${UPSTREAM_BASE}/api/v1/${verdict.path}${new URL(request.url).search}`;
  const headers = cleanHeaders(request);
  const apiKey = await resolveProviderApiKey(request);
  if (!apiKey.ok || !apiKey.key) return NextResponse.json({ error: '模型服务未配置或不可用' }, { status: 503 });
  if (apiKey.key) headers.set('x-api-key', apiKey.key);
  try {
    const response = await fetch(targetUrl, { headers, method: 'GET' });
    const data = await response.json().catch(() => null);
    return NextResponse.json(data, { status: response.status });
  } catch (error) { console.error('[proxy/v1/GET]', { code: error.code || 'UPSTREAM_ERROR' }); return NextResponse.json({ error: publicErrorMessage(error, '上游请求异常') }, { status: 502 }); }
}

export async function POST(request, context) {
  const { path: pathSegments = [] } = await context.params;
  const endpoint = pathSegments[0] || '';
  const user = await getUserFromRequest(request);
  if (!user) return NextResponse.json({ error: '请先登录后再创建生成任务' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 256 * 1024 });
  if (guarded) return guarded;
  const limit = await consumeRateLimit({ scope: 'generation_user', subject: user.id || getClientIp(request), limit: 60, windowMs: 60 * 60 * 1000 });
  if (!limit.allowed) return rateLimitResponse(limit);

  const modelConfig = await findModelByEndpointOrId(endpoint);
  if (modelConfig && !modelConfig.is_active) return NextResponse.json({ error: `模型 [${modelConfig.name}] 当前正在维护升级中，已被管理员暂停调用，请切换其他模型。` }, { status: 403 });
  const rawBodyText = await request.text().catch(() => '');
  let body = {};
  try { body = rawBodyText ? JSON.parse(rawBodyText) : {}; } catch { return NextResponse.json({ error: '请求体必须是有效 JSON' }, { status: 422 }); }
  if (user.status === 'suspended') return NextResponse.json({ error: '账户已被封禁，无权发起生成' }, { status: 403 });

  const idempotencyKey = request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key');
  try {
    const task = await createGenerationTask({
      user,
      modelId: modelConfig?.id || endpoint,
      studioId: modelConfig?.type || 'studio',
      prompt: body.prompt,
      parameters: { ...body, endpoint: modelConfig?.id || endpoint },
      idempotencyKey,
      label: body.label,
    });
    if (task.idempotent && task.creation.status !== 'queued') {
      return NextResponse.json({
        creation_id: task.creation.id,
        status: task.creation.status,
        url: task.creation.result_url || undefined,
        request_id: task.creation.provider_request_id || task.creation.external_request_id || undefined,
      });
    }

    if (process.env.GENERATION_ASYNC === 'true') {
      return NextResponse.json({
        creation_id: task.creation.id,
        status: task.creation.status,
        request_id: task.creation.id,
      }, { status: task.idempotent ? 200 : 202 });
    }

    const processed = await processGenerationTask({ creationId: task.creation.id });
    const status = processed.success === false ? 502 : processed.pending ? 202 : 200;
    return NextResponse.json({
      creation_id: processed.creation?.id,
      status: processed.creation?.status,
      url: processed.creation?.result_url || undefined,
      request_id: processed.providerRequestId || processed.creation?.provider_request_id || undefined,
      error: processed.error || undefined,
    }, { status });
  } catch (error) {
    const status = error.code === 'IDEMPOTENCY_CONFLICT' ? 409
      : error.code === 'INSUFFICIENT_CREDITS' ? 402
        : error.code === 'MODEL_NOT_FOUND' ? 404
          : error.code === 'IDEMPOTENCY_REQUIRED' ? 422
            : 500;
    console.error('[proxy/v1/generation]', { code: error.code || 'GENERATION_FAILED' });
    return NextResponse.json({ error: publicErrorMessage(error, '生成任务创建失败'), code: error.code || 'GENERATION_FAILED' }, { status });
  }
}
