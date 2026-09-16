import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/billing';
import { findModelByEndpointOrId } from '@/lib/repositories/models';
import { attachGenerationRequest, refundGeneration, reserveGeneration } from '@/lib/services/generations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UPSTREAM_BASE = process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai';

function cleanHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host'); headers.delete('connection'); headers.delete('cookie');
  return headers;
}

export async function GET(request, context) {
  const { path: pathSegments = [] } = await context.params;
  const targetUrl = `${UPSTREAM_BASE}/api/v1/${pathSegments.join('/')}${new URL(request.url).search}`;
  const headers = cleanHeaders(request);
  if (!headers.get('x-api-key') && process.env.MUAPI_API_KEY) headers.set('x-api-key', process.env.MUAPI_API_KEY);
  try {
    const response = await fetch(targetUrl, { headers, method: 'GET' });
    const data = await response.json().catch(() => null);
    const requestId = data?.request_id || data?.id || pathSegments[1];
    const resultUrl = data?.outputs?.[0] || data?.url || data?.output?.url;
    return NextResponse.json(data, { status: response.status });
  } catch (error) { console.error('[proxy/v1/GET]', error); return NextResponse.json({ error: error.message || '上游请求异常' }, { status: 502 }); }
}

export async function POST(request, context) {
  const { path: pathSegments = [] } = await context.params;
  const endpoint = pathSegments[0] || '';
  const targetUrl = `${UPSTREAM_BASE}/api/v1/${pathSegments.join('/')}${new URL(request.url).search}`;
  const user = await getUserFromRequest(request);
  const modelConfig = await findModelByEndpointOrId(endpoint);
  if (modelConfig && !modelConfig.is_active) return NextResponse.json({ error: `模型 [${modelConfig.name}] 当前正在维护升级中，已被管理员暂停调用，请切换其他模型。` }, { status: 403 });
  const creditCost = modelConfig ? Number(modelConfig.credits_price || 1) : 1;
  let ledgerEntryId = null; let creationRecordId = null;

  if (user) {
    if (user.status === 'suspended') return NextResponse.json({ error: '账户已被封禁，无权发起生成' }, { status: 403 });
    try {
        const reservation = await reserveGeneration({ user, creditCost, modelConfig, endpoint });
        ledgerEntryId = reservation.ledgerEntryId;
        creationRecordId = reservation.creationRecordId;
    } catch (error) {
      if (error.code === 'INSUFFICIENT_CREDITS') return NextResponse.json({ error: '当前算力额度不足，请先充值或升级会员。', code: error.code }, { status: 402 });
      console.error('[proxy/v1/deduct]', error); return NextResponse.json({ error: '额度结算处理失败' }, { status: 500 });
    }
  }

  const rawBodyText = await request.text().catch(() => '');
  const headers = cleanHeaders(request);
  if (!headers.get('content-type')) headers.set('content-type', 'application/json');
  const clientKey = request.headers.get('x-api-key');
  if (clientKey && clientKey !== 'koyosim-account-session') headers.set('x-api-key', clientKey); else if (process.env.MUAPI_API_KEY) headers.set('x-api-key', process.env.MUAPI_API_KEY);
  try {
    const upstreamRes = await fetch(targetUrl, { method: 'POST', headers, body: rawBodyText });
    const data = await upstreamRes.json().catch(() => null);
    if (!upstreamRes.ok || !data) {
      await refundGeneration({ user, creditCost, creationRecordId, modelConfig, reason: '生成异常自动退还', error: { code: String(upstreamRes.status), message: data?.error || upstreamRes.statusText } }).catch((error) => console.error('[proxy/v1/auto-refund]', error));
      return NextResponse.json(data || { error: `上游服务响应异常 (${upstreamRes.status})` }, { status: upstreamRes.status });
    }
    const requestId = data.request_id || data.id;
    if (creationRecordId && requestId) await attachGenerationRequest(creationRecordId, requestId);
    return NextResponse.json(data, { status: upstreamRes.status });
  } catch (error) {
    await refundGeneration({ user, creditCost, creationRecordId, modelConfig, reason: '网络异常自动退还', error: { code: 'NETWORK_ERROR', message: error.message } }).catch(() => {});
    return NextResponse.json({ error: `调用上游服务网络超时: ${error.message}` }, { status: 504 });
  }
}
