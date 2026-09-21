import crypto from 'node:crypto';
import { json } from '@/lib/services/auth';
import { handleGenerationCallback } from '@/lib/services/generationCore';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

function isAuthorized(request) {
  const configured = String(process.env.GENERATION_CALLBACK_SECRET || '');
  const received = request.headers.get('x-generation-callback-secret') || '';
  if (configured.length < 32 || received.length !== configured.length) return false;
  return crypto.timingSafeEqual(Buffer.from(received), Buffer.from(configured));
}

export async function POST(request, context) {
  if (!isAuthorized(request)) return json({ error: '无效的供应商回调凭据' }, { status: 401 });
  const callbackKey = request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key');
  if (!callbackKey || callbackKey.trim().length < 8) return json({ error: '缺少有效的回调幂等键' }, { status: 422 });

  let body;
  try { body = await request.json(); } catch { return json({ error: '无效的回调数据' }, { status: 400 }); }
  const { id } = await context.params;
  try {
    const result = await handleGenerationCallback({
      creationId: id,
      status: body.status,
      resultUrl: body.resultUrl || body.url || null,
      providerRequestId: body.providerRequestId || body.request_id || null,
      errorCode: body.errorCode || body.error_code,
      errorReason: body.errorReason || body.error || undefined,
      actualCostUsd: body.actualCostUsd ?? body.cost_usd ?? 0,
      durationMs: body.durationMs ?? null,
      callbackIdempotencyKey: callbackKey,
    });
    if (result.error === 'TASK_NOT_FOUND') return json({ error: '任务不存在' }, { status: 404 });
    return json(result);
  } catch (error) {
    console.error('[api/generations/callback]', error);
    const status = error.code === 'IDEMPOTENCY_REQUIRED' ? 422 : error.code === 'INVALID_CALLBACK_STATUS' ? 400 : 409;
    return json({ error: publicErrorMessage(error, '供应商回调处理失败'), code: error.code || 'CALLBACK_FAILED' }, { status });
  }
}
