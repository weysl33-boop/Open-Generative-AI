import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth';
import {
  buildAuthorizationUrl,
  createOAuthState,
  createPkceVerifier,
  getOAuthProvider,
  getPublicAppOrigin,
  getRedirectUri,
  getResolvedOAuthConfig,
} from '@/lib/oauth';

export const runtime = 'nodejs';

function safeReturnTo(value) {
  const candidate = String(value || '/studio');
  return candidate.startsWith('/') && !candidate.startsWith('//') ? candidate : '/studio';
}

function jsonForInlineScript(value) {
  return JSON.stringify(value).replace(/[<>&\u2028\u2029]/g, (character) => ({
    '<': '\\u003c',
    '>': '\\u003e',
    '&': '\\u0026',
    '\u2028': '\\u2028',
    '\u2029': '\\u2029',
  })[character]);
}

export async function GET(request, { params }) {
  const provider = String((await params).provider || '').toLowerCase();
  const origin = getPublicAppOrigin(request);
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get('returnTo'));

  if (!getOAuthProvider(provider)) {
    // 相对 Location：绝对地址会把用户送回内网的 localhost:3100。
    return new NextResponse(null, {
      status: 302,
      headers: { location: `/account?auth_error=${encodeURIComponent('不支持的登录方式')}` },
    });
  }

  const resolved = await getResolvedOAuthConfig(provider);
  if (!resolved || !resolved.configured) {
    const providerNames = {
      google: 'Google',
      x: 'X (Twitter)',
      tiktok: 'TikTok',
      wechat: '微信',
      qq: 'QQ',
      douyin: '抖音',
    };
    const name = providerNames[provider] || provider;
    const msg = `${name}快捷登录尚未配置开放平台应用凭据，请联系管理员完成配置。`;
    const safeName = name.replace(/[&<>"']/g, '');
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${name} 登录提示</title>
      <style>body{background:#0a0a0c;color:#fff;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;padding:20px;box-sizing:border-box;}
      .card{background:#18181b;border:1px solid rgba(255,255,255,0.1);border-radius:16px;padding:28px;max-width:380px;text-align:center;box-shadow:0 20px 40px rgba(0,0,0,0.5);}
      h2{font-size:18px;margin:0 0 10px;color:#22d3ee;} p{font-size:13px;color:#a1a1aa;line-height:1.6;margin:0 0 20px;}
      .btn{background:#22d3ee;color:#000;font-weight:bold;border:none;border-radius:8px;padding:10px 20px;cursor:pointer;font-size:13px;text-decoration:none;display:inline-block;}</style>
      </head><body><div class="card"><h2>${safeName} 登录尚未配置</h2><p>${msg} 请由管理员在「系统与安全 → 登录方式与连通性 → 社交登录」配置回调域与应用凭据，或暂用手机号/邮箱登录。</p><button class="btn" onclick="closeOrBack()">确定并返回</button></div>
      <script>
        const message = { type: 'koyosim-auth-complete', ok: false, message: ${jsonForInlineScript(msg)} };
        if (window.opener && window.opener !== window) {
          window.opener.postMessage(message, ${jsonForInlineScript(origin)});
          setTimeout(() => { window.close(); }, 2500);
        }
        function closeOrBack() {
          if (window.opener && window.opener !== window) { window.close(); }
          else { window.location.href = ${jsonForInlineScript(returnTo)}; }
        }
      </script></body></html>`;
    return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
  }

  const currentUser = await getUserFromRequest(request);
  const verifier = createPkceVerifier();
  const state = createOAuthState({
    provider,
    verifier,
    returnTo: safeReturnTo(request.nextUrl.searchParams.get('returnTo')),
    bindUserId: currentUser?.id || null,
  });
  const redirectUri = getRedirectUri(request, provider);
  const authUrl = await buildAuthorizationUrl(provider, redirectUri, state.state, verifier, resolved);
  const response = NextResponse.redirect(authUrl);
  response.cookies.set('ko_oauth_state', state.cookieValue, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return response;
}
