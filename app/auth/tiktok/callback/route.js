import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// OAuth 回调的唯一实现在 /api/auth/oauth/<provider>/callback；本路由只是历史深链接的同域转发入口。
export async function GET(request) {
  const source = new URL(request.url);
  const forwarded = new URL('/api/auth/oauth/tiktok/callback', request.url);
  for (const key of ['code', 'state', 'error', 'error_description']) {
    const value = source.searchParams.get(key);
    if (value) forwarded.searchParams.set(key, value);
  }
  return NextResponse.redirect(forwarded, 302);
}
