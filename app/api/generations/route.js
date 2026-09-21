import { getUserFromRequest, json } from '@/lib/services/auth';
import { createGenerationTask, processGenerationTask } from '@/lib/services/generationCore';
import { getGenerationTrace, listUserGenerations } from '@/lib/services/generations';
import { consumeRateLimit, getClientIp, guardMutation, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';
import { validatePromptSafety } from '@/lib/security/contentModeration';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const creationId = request.nextUrl.searchParams.get('id');
  if (creationId) {
    const trace = await getGenerationTrace(creationId);
    if (!trace || trace.creation.user_id !== user.id) return json({ error: '任务不存在' }, { status: 404 });
    return json(trace);
  }

  const result = await listUserGenerations(user.id, Math.min(100, Number(request.nextUrl.searchParams.get('limit') || 50)));
  return json({ creations: result });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const guarded = guardMutation(request, { maxBytes: 256 * 1024 });
    if (guarded) return guarded;
    const limit = await consumeRateLimit({ scope: 'generation_user', subject: user.id || getClientIp(request), limit: 60, windowMs: 60 * 60 * 1000 });
    if (!limit.allowed) return rateLimitResponse(limit);
    const body = await request.json();
    const moderation = validatePromptSafety(body.prompt);
    if (!moderation.passed) {
      return json({ error: moderation.reason, code: moderation.code }, { status: 422 });
    }
    const idempotencyKey = request.headers.get('idempotency-key') || request.headers.get('x-idempotency-key');
    const task = await createGenerationTask({
      user,
      modelId: body.modelId || body.model || body.endpoint,
      studioId: body.studioId || 'studio',
      prompt: body.prompt,
      parameters: body.parameters || body,
      idempotencyKey,
      label: body.label,
      preparedQuoteId: body.quote_id || body.quoteId || null,
    });

    if (task.idempotent && task.creation.status !== 'queued') return json(task, { status: 200 });
    if (process.env.GENERATION_ASYNC === 'true') {
      return json({
        ...task,
        creation_id: task.creation.id,
        status: task.creation.status,
      }, { status: task.idempotent ? 200 : 202 });
    }
    const processed = await processGenerationTask({ creationId: task.creation.id });
    if (processed.success === false) return json(processed, { status: 502 });
    return json({ ...task, ...processed }, { status: processed.pending ? 202 : 201 });
  } catch (error) {
    console.error('[api/generations]', error);
    const status = error.code === 'UNAUTHENTICATED' ? 401
      : error.code === 'IDEMPOTENCY_CONFLICT' ? 409
        : error.code === 'INSUFFICIENT_CREDITS' ? 402
          : error.code === 'MODEL_NOT_FOUND' ? 404
            : 422;
    return json({ error: publicErrorMessage(error, '创建生成任务失败'), code: error.code || 'GENERATION_CREATE_FAILED' }, { status });
  }
}
