import { NextResponse } from 'next/server';
import { createOAuthUser, createSession, setSessionCookie } from '@/lib/billing';
import {
  exchangeOAuthCode,
  fetchOAuthProfile,
  getOAuthProvider,
  getRedirectUri,
  readOAuthState,
} from '@/lib/oauth';

export const runtime = 'nodejs';

function htmlResponse(request, { ok, returnTo, message }) {
  const origin = new URL(request.url).origin;
  const safePath = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/account';
  const payload = JSON.stringify({ type: 'koyosim-auth-complete', ok, message: message || null });
  const target = JSON.stringify(`${origin}${safePath}${safePath.includes('?') ? '&' : '?'}auth=${ok ? 'success' : 'error'}`);
  const html = `<!doctype html><meta charset="utf-8"><script>
    const message = ${payload};
    if (window.opener && window.opener !== window) { window.opener.postMessage(message, ${JSON.stringify(origin)}); window.close(); }
    else { window.location.replace(${target}); }
  </script><p>正在返回 KoyoSIM AI Studio…</p>`;
  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

export async function GET(request, { params }) {
  const provider = String((await params).provider || '').toLowerCase();
  const state = readOAuthState(request.cookies.get('ko_oauth_state')?.value);
  const returnTo = state?.returnTo || '/account';
  try {
    if (!state || state.provider !== provider || !getOAuthProvider(provider)) throw new Error('OAuth state 无效或已过期');
    const error = request.nextUrl.searchParams.get('error');
    if (error) throw new Error(request.nextUrl.searchParams.get('error_description') || error);
    const code = request.nextUrl.searchParams.get('code');
    if (!code) throw new Error('OAuth 未返回授权码');

    const token = await exchangeOAuthCode(provider, code, getRedirectUri(request, provider), state.verifier);
    const profile = await fetchOAuthProfile(provider, token.access_token);
    if (!profile.id) throw new Error('OAuth 未返回用户标识');
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
    const user = await createOAuthUser({
      provider,
      providerUserId: profile.id,
      email: profile.email,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || profile.avatar,
      profile,
      ip
    });
    if (user?.error) throw new Error(user.message || '账户已被封禁或异常');
    const session = await createSession(user.id);
    const response = htmlResponse(request, { ok: true, returnTo });
    setSessionCookie(response, session.token, session.expires);
    response.cookies.set('ko_oauth_state', '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    console.error(`[auth/oauth/${provider}]`, error.message);
    const response = htmlResponse(request, { ok: false, returnTo, message: '第三方登录失败，请重试' });
    response.cookies.set('ko_oauth_state', '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
  }
}
