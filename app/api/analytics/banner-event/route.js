import { getUserFromRequest, json } from '@/lib/services/auth';
import { recordBannerEvent } from '@/lib/services/content';
import {
  consumeRateLimit,
  getClientIp,
  guardMutation,
  rateLimitResponse,
} from '@/lib/security/requestGuard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function readBody(request) {
  const contentType = request.headers.get('content-type') || '';
  if (contentType.includes('text/plain')) {
    // 兼容 navigator.sendBeacon 发的 text/plain JSON 字符串：它拿不到自定义头，只能靠这个。
    return JSON.parse(await request.text());
  }
  return await request.json();
}

/** 横幅埋点：失败一律静默成 `{ ok: false }`，埋点不该让横幅行为可见地变差。 */
export async function POST(request) {
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    const ip = getClientIp(request);
    const limited = await consumeRateLimit({
      scope: 'banner_event',
      subject: ip,
      limit: 30,
      windowMs: 60 * 1000,
    });
    if (!limited.allowed) return rateLimitResponse(limited);

    const body = await readBody(request);
    // 身份只从会话取：body 里的 userId 是伪造面，合法调用方从来不发它。
    const user = await getUserFromRequest(request);

    const ok = await recordBannerEvent({
      bannerId: body.bannerId,
      eventType: body.eventType,
      userId: user?.id || null,
      anonymousId: body.anonymousId,
      targetUrl: body.targetUrl,
      pagePath: body.pagePath,
      locale: body.locale,
      userAgent: request.headers.get('user-agent') || '',
      ip,
    });

    return json({ ok });
  } catch (error) {
    console.warn('[analytics/banner-event error]', error?.message || error);
    return json({ ok: false });
  }
}
