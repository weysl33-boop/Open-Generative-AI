import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/billing';
import { execute, nowIso, queryOne, randomId, withTransaction } from '@/lib/db';
import { findModelByEndpointOrId } from '@/lib/repositories/models';
import { insertCreditEntry, } from '@/lib/repositories/credits';
import { updateUserCredits } from '@/lib/repositories/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const UPSTREAM_BASE = process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai';

function cleanHeaders(request) {
  const headers = new Headers(request.headers);
  headers.delete('host'); headers.delete('connection'); headers.delete('cookie');
  return headers;
}

async function refundGeneration({ user, creditCost, creationRecordId, modelConfig, reason, error }) {
  if (!user || !creditCost) return;
  await withTransaction(async (tx) => {
    const current = await tx.queryOne('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const refundedCredits = Number(current?.credits || 0) + creditCost;
    await updateUserCredits(tx, user.id, refundedCredits);
    await insertCreditEntry(tx, { userId: user.id, delta: creditCost, reason: `${reason} - ${modelConfig?.name || 'model'}`, referenceId: creationRecordId, metadata: { error } });
    if (creationRecordId) await tx.execute("UPDATE creations SET status = 'failed', error_code = $1, error_reason = $2, updated_at = $3 WHERE id = $4", [error?.code || 'UPSTREAM_ERROR', String(error?.message || error || '').slice(0, 200), nowIso(), creationRecordId]);
  });
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
    if (requestId && resultUrl) await execute("UPDATE creations SET status = 'completed', result_url = $1, completed_at = $2, updated_at = $2 WHERE external_request_id = $3 OR id = $3", [resultUrl, nowIso(), requestId]);
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
      await withTransaction(async (tx) => {
        const current = await tx.queryOne('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [user.id]);
        if (Number(current?.credits || 0) < creditCost) throw Object.assign(new Error('额度不足'), { code: 'INSUFFICIENT_CREDITS' });
        await updateUserCredits(tx, user.id, Number(current.credits) - creditCost);
        ledgerEntryId = await insertCreditEntry(tx, { userId: user.id, delta: -creditCost, reason: `AI 生成消耗 - ${modelConfig?.name || endpoint}`, metadata: { model: endpoint, provider: modelConfig?.provider || 'muapi' } });
        creationRecordId = randomId('gen');
        await tx.execute(`INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, provider, model, created_at, updated_at) VALUES ($1, $2, $3, $4, 'processing', $5, $6, $7, $8, $8)`, [creationRecordId, user.id, modelConfig?.type || 'image', `调用 ${modelConfig?.name || endpoint}`, creditCost, modelConfig?.provider || 'muapi', endpoint, nowIso()]);
      });
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
    if (creationRecordId && requestId) await execute('UPDATE creations SET external_request_id = $1, updated_at = $2 WHERE id = $3', [requestId, nowIso(), creationRecordId]);
    return NextResponse.json(data, { status: upstreamRes.status });
  } catch (error) {
    await refundGeneration({ user, creditCost, creationRecordId, modelConfig, reason: '网络异常自动退还', error: { code: 'NETWORK_ERROR', message: error.message } }).catch(() => {});
    return NextResponse.json({ error: `调用上游服务网络超时: ${error.message}` }, { status: 504 });
  }
}
