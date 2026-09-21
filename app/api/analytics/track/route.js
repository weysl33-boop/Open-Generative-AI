import { getUserFromRequest, json } from '@/lib/services/auth';
import { recordUserActivity } from '@/lib/services/activity';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const action = String(body.action || '').trim();
    if (!action) {
      return json({ error: '缺少 action 参数' }, { status: 400 });
    }

    const ip = getClientIp(request);
    const userAgent = request.headers.get('user-agent');

    await recordUserActivity({
      userId: user?.id || null,
      sessionId: body.sessionId || null,
      category: String(body.category || 'client'),
      action,
      targetType: body.targetType || null,
      targetId: body.targetId || null,
      modelName: body.modelName || null,
      metadata: body.metadata || {},
      ip,
      userAgent,
    });

    return json({ ok: true });
  } catch (error) {
    console.error('[analytics/track error]', error);
    return json({ ok: false }, { status: 500 });
  }
}
