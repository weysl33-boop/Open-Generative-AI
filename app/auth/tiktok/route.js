import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// /auth/tiktok 是旧的发起登录入口，转发到唯一的 OAuth 发起路由。
export function GET(request) {
  const source = new URL(request.url);
  const forwarded = new URL('/api/auth/oauth/tiktok', request.url);
  const returnTo = source.searchParams.get('returnTo');
  if (returnTo) forwarded.searchParams.set('returnTo', returnTo);
  return NextResponse.redirect(forwarded, 302);
}
