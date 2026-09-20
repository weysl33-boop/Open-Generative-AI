import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SAFE_PROVIDER = /^[a-z0-9_-]{1,32}$/;

// OAuth 换码、建会话的唯一实现固定在 /api/auth/oauth/<provider>/callback。
// /auth/* 只是历史深链接入口，这里做同域转发，绝不重复一份回调逻辑。
export async function GET(request, { params }) {
  const provider = String((await params).provider || '').toLowerCase();
  const target = new URL(request.url);
  if (!SAFE_PROVIDER.test(provider)) {
    return NextResponse.redirect(new URL('/account', request.url), 302);
  }
  const forwarded = new URL(`/api/auth/oauth/${provider}/callback`, request.url);
  for (const key of ['code', 'state', 'error', 'error_description']) {
    const value = target.searchParams.get(key);
    if (value) forwarded.searchParams.set(key, value);
  }
  return NextResponse.redirect(forwarded, 302);
}
