import { getUserFromRequest, json } from '@/lib/services/auth';
import { submitFeedback, listMyFeedback } from '@/lib/services/feedback';
import { guardMutation, consumeRateLimit, rateLimitResponse } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    return json({ items: await listMyFeedback(user.id, { limit: 20 }) });
  } catch (error) {
    console.error('[api/feedback GET]', error);
    return json({ error: publicErrorMessage(error, '获取提交记录失败') }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再提交' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 64 * 1024 });
  if (guarded) return guarded;

  try {
    const limited = await consumeRateLimit({
      scope: 'feedback_submit',
      subject: user.id,
      limit: 10,
      windowMs: 3600 * 1000,
    });
    if (!limited.allowed) return rateLimitResponse(limited);

    const body = await request.json();
    const result = await submitFeedback({
      userId: user.id,
      kind: body.kind,
      title: body.title,
      pageUrl: body.pageUrl,
      detail: body.detail,
    });

    if (result.error) return json({ error: result.error }, { status: 400 });

    return json({
      ...result,
      message: '提交成功，审核通过后硬币会自动到账',
    });
  } catch (error) {
    console.error('[api/feedback POST]', error);
    return json({ error: publicErrorMessage(error, '提交失败，请稍后重试') }, { status: 400 });
  }
}
