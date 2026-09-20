import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// /auth/tiktok 是旧的发起登录入口，转发到唯一的 OAuth 发起路由。
// Location 用相对路径：nginx 未回传对外 Host，绝对地址会指向内网 localhost:3100。
export function GET(request) {
  const returnTo = new URL(request.url).searchParams.get('returnTo');
  const location = returnTo
    ? `/api/auth/oauth/tiktok?returnTo=${encodeURIComponent(returnTo)}`
    : '/api/auth/oauth/tiktok';
  return new NextResponse(null, { status: 302, headers: { location } });
}
