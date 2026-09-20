import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SAFE_PROVIDER = /^[a-z0-9_-]{1,32}$/;
const FORWARDED_KEYS = ['code', 'state', 'error', 'error_description'];

// OAuth 换码与建会话的唯一实现固定在 /api/auth/oauth/<provider>/callback，
// /auth/* 只是历史深链接入口，这里做同域转发，绝不重复一份回调逻辑。
// Location 必须是相对路径：nginx 未回传对外 Host，拼绝对地址会指向内网 localhost:3100。
function forwardTo(request, provider) {
  const query = new URLSearchParams();
  const source = new URL(request.url);
  for (const key of FORWARDED_KEYS) {
    const value = source.searchParams.get(key);
    if (value) query.set(key, value);
  }
  const search = query.toString();
  return new NextResponse(null, {
    status: 302,
    headers: { location: `/api/auth/oauth/${provider}/callback${search ? `?${search}` : ''}` },
  });
}

export async function GET(request, { params }) {
  const provider = String((await params).provider || '').toLowerCase();
  if (!SAFE_PROVIDER.test(provider)) {
    return new NextResponse(null, { status: 302, headers: { location: '/account' } });
  }
  return forwardTo(request, provider);
}
