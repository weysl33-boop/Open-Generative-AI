import { NextResponse } from 'next/server';
import {
  buildAuthorizationUrl,
  createOAuthState,
  createPkceVerifier,
  getOAuthProvider,
  getRedirectUri,
  isOAuthConfigured,
} from '@/lib/oauth';

export const runtime = 'nodejs';

function safeReturnTo(value) {
  const candidate = String(value || '/studio');
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/studio';
}

export async function GET(request, { params }) {
  const provider = String((await params).provider || '').toLowerCase();
  const origin = new URL(request.url).origin;
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  if (!getOAuthProvider(provider)) {
    return NextResponse.redirect(new URL(`/account?auth_error=${encodeURIComponent('不支持的登录方式')}`, request.url));
  }

  if (!isOAuthConfigured(provider)) {
    const providerNames = { google: 'Google', x: 'X (Twitter)', tiktok: 'TikTok' };
    const name = providerNames[provider] || provider;
    const msg = `${name} 快捷登录尚未在服务器配置 Client ID / Secret`;
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${name} 登录提示</title>
      <style>body{background:#0a0a0c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;}
      .card{background:#18181b;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;max-width:380px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.5);}
      h2{font-size:18px;margin:0 0 10px;color:#22d3ee;} p{font-size:13px;color:#a1a1aa;line-height:1.6;margin:0 0 20px;}
      .btn{background:#22d3ee;color:#000;font-weight:bold;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block;}</style>
      </head><body><div class="card"><h2>${name} 登录尚未配置</h2><p>${msg}。请在 .env 文件中配置相应密钥，或使用邮箱密码直接登录体验。</p><button class="btn" onclick="closeOrBack()">确定并返回</button></div>
      <script>
        const message = { type: 'koyosim-auth-complete', ok: false, message: ${JSON.stringify(msg)} };
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(message, ${JSON.stringify(origin)});
          setTimeout(() => { window.close(); }, 2500);
        }
        function closeOrBack() {
          if (window.opener && window.opener !== window) { window.close(); }
          else { window.location.href = ${JSON.stringify(returnTo)}; }
        }
      </script></body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const verifier = createPkceVerifier();
  const state = createOAuthState({
    provider,
    verifier,
    returnTo: safeReturnTo(request.nextUrl.searchParams.get('returnTo')),
  });
  const redirectUri = getRedirectUri(request, provider);
  const response = NextResponse.redirect(buildAuthorizationUrl(provider, redirectUri, state, verifier));
  response.cookies.set('ko_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
