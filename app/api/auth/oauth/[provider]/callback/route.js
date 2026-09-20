import { NextResponse } from 'next/server';
import { createOAuthUser, bindOAuthUser, createSession, setSessionCookie } from '@/lib/services/auth';
import {
  exchangeOAuthCode,
  fetchOAuthProfile,
  getOAuthProvider,
  getPublicAppOrigin,
  getRedirectUri,
  readOAuthState,
} from '@/lib/oauth';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

function htmlResponse(request, { ok, returnTo, message }) {
  const origin = getPublicAppOrigin(request);
  const safePath = returnTo?.startsWith('/') && !returnTo.startsWith('//') ? returnTo : '/studio';
  const target = `${origin}${safePath}${safePath.includes('?') ? '&' : '?'}auth=${ok ? 'success' : 'error'}${message ? `&msg=${encodeURIComponent(message)}` : ''}`;
  const payload = JSON.stringify({ type: 'koyosim-auth-complete', ok, message: message || null });
  
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KoyoSIM AI Studio</title>
  <style>
    body{margin:0;height:100vh;display:flex;align-items:center;justify-content:center;background:#09090b;color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,sans-serif;}
    .box{display:flex;flex-direction:column;align-items:center;gap:16px;}
    .spinner{width:32px;height:32px;border:3px solid rgba(34,211,238,0.2);border-top-color:#22d3ee;border-radius:50%;animation:spin 0.8s linear infinite;}
    @keyframes spin{to{transform:rotate(360deg);}}
    p{font-size:13px;color:#a1a1aa;margin:0;}
  </style>
  <script>
    const message = ${payload};
    try {
      if (window.opener && window.opener !== window) {
        window.opener.postMessage(message, ${JSON.stringify(origin)});
        setTimeout(() => window.close(), 300);
      } else {
        window.location.replace(${JSON.stringify(target)});
      }
    } catch {
      window.location.replace(${JSON.stringify(target)});
    }
  </script>
  </head><body><div class="box"><div class="spinner"></div><p>${ok ? '授权成功，正在进入 KoyoSIM AI Studio…' : '正在返回…'}</p></div></body></html>`;
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

    if (state.bindUserId) {
      const bindResult = await bindOAuthUser({
        userId: state.bindUserId,
        provider,
        providerUserId: profile.id,
        email: profile.email,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl || profile.avatar,
        profile,
        ip
      });
      if (bindResult?.error) throw Object.assign(new Error(bindResult.message || '绑定第三方账号失败'), { code: bindResult.error });
      const response = htmlResponse(request, { ok: true, returnTo, message: '第三方账号绑定成功！' });
      response.cookies.set('ko_oauth_state', '', { httpOnly: true, path: '/', maxAge: 0 });
      return response;
    }

    const user = await createOAuthUser({
      provider,
      providerUserId: profile.id,
      email: profile.email,
      emailVerified: profile.emailVerified === true,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || profile.avatar,
      profile,
      ip
    });
    if (user?.error) throw Object.assign(new Error(user.message || '账户已被封禁或异常'), { code: user.error });
    const session = await createSession(user.id);
    const response = htmlResponse(request, { ok: true, returnTo });
    setSessionCookie(response, session.token, session.expires);
    response.cookies.set('ko_oauth_state', '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
  } catch (error) {
    console.error(`[auth/oauth/${provider}]`, { code: error.code || 'OAUTH_CALLBACK_FAILED', error });
    const response = htmlResponse(request, { ok: false, returnTo, message: publicErrorMessage(error, '第三方登录失败，请重试') });
    response.cookies.set('ko_oauth_state', '', { httpOnly: true, path: '/', maxAge: 0 });
    return response;
  }
}
