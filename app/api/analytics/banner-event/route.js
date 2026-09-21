import { NextResponse } from 'next/server';
import { recordBannerEvent } from '@/lib/services/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    let body = {};
    const contentType = request.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      body = await request.json();
    } else if (contentType.includes('text/plain')) {
      // 兼容 navigator.sendBeacon 发送的 text/plain JSON 字符串
      const text = await request.text();
      body = JSON.parse(text);
    } else {
      body = await request.json();
    }

    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      request.headers.get('x-real-ip') ||
      '127.0.0.1';
    const userAgent = request.headers.get('user-agent') || '';

    const ok = await recordBannerEvent({
      bannerId: body.bannerId,
      eventType: body.eventType,
      userId: body.userId,
      anonymousId: body.anonymousId,
      targetUrl: body.targetUrl,
      pagePath: body.pagePath,
      locale: body.locale,
      userAgent,
      ip,
    });

    return NextResponse.json({ ok });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 400 });
  }
}
