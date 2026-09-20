import "server-only";

import { NextResponse } from "next/server";
import { bindUserOAuth, createOAuthUser, createSession, setSessionCookie } from "./auth.js";
import {
  exchangeOAuthCode,
  fetchOAuthProfile,
  getOAuthProvider,
  getPublicAppOrigin,
  getRedirectUri,
  readOAuthState,
} from "../oauth.js";

export function htmlResponse(request, { ok, returnTo, message, action = "login", provider = null, isNew = false }) {
  const origin = getPublicAppOrigin(request);
  const safePath = returnTo?.startsWith("/") && !returnTo.startsWith("//") ? returnTo : "/account";
  const payload = JSON.stringify({
    type: "koyosim-auth-complete",
    ok,
    message: message || null,
    action,
    provider,
    isNew: Boolean(isNew),
  });
  const urlDelim = safePath.includes("?") ? "&" : "?";
  const target = JSON.stringify(`${origin}${safePath}${urlDelim}auth=${ok ? "success" : "error"}${isNew ? "&isNew=1" : ""}&provider=${provider || ""}`);
  const html = `<!doctype html><meta charset="utf-8"><script>
    const message = ${payload};
    if (window.opener && window.opener !== window) {
      try { window.opener.postMessage(message, ${JSON.stringify(origin)}); } catch(e) {}
      try { window.opener.postMessage(message, "*"); } catch(e) {}
      setTimeout(() => { window.close(); }, 350);
    } else {
      window.location.replace(${target});
    }
  </script><p style="font-family:-apple-system,BlinkMacSystemFont,sans-serif;color:#a1a1aa;text-align:center;padding:40px;background:#0e1017;height:100vh;margin:0;">正在完成快捷授权并返回 KoyoSIM AI Studio…</p>`;
  return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export async function handleOAuthCallback(request, providerParam) {
  const cookieStateRaw = request.cookies.get("ko_oauth_state")?.value;
  const queryStateRaw = request.nextUrl.searchParams.get("state");
  // 优先使用 query 中的 signed HMAC state，若不存在则降级为 cookie
  const stateRaw = queryStateRaw || cookieStateRaw;
  const state = readOAuthState(stateRaw);
  const provider = String(providerParam || state?.provider || "").toLowerCase();
  const returnTo = state?.returnTo || "/account";
  const mode = state?.mode || "login";

  try {
    if (!state || (provider && state.provider && state.provider !== provider) || !getOAuthProvider(state.provider || provider)) {
      throw new Error("OAuth 授权状态已失效或已过期，请重新点击登录");
    }
    const targetProvider = state.provider || provider;
    const error = request.nextUrl.searchParams.get("error");
    if (error) throw new Error(request.nextUrl.searchParams.get("error_description") || error);
    const code = request.nextUrl.searchParams.get("code");
    if (!code) throw new Error("OAuth 未返回有效授权码");

    const redirectUri = state?.redirectUri || getRedirectUri(request, targetProvider);
    const token = await exchangeOAuthCode(targetProvider, code, redirectUri, state.verifier);
    const accessToken = token.access_token || token.data?.access_token;
    if (!accessToken) throw new Error(`${targetProvider} 未返回 access_token 访问令牌`);
    const profile = await fetchOAuthProfile(targetProvider, accessToken);
    if (!profile.id) throw new Error("OAuth 未返回用户标识");

    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || null;

    // 绑定模式 (来自个人中心绑定/换绑发起)
    if (mode === "bind" && state.bindUserId) {
      const bindResult = await bindUserOAuth({
        userId: state.bindUserId,
        provider: targetProvider,
        providerUserId: profile.id,
        providerEmail: profile.email,
        displayName: profile.displayName,
        profile,
        ip,
      });

      if (bindResult?.error) {
        const response = htmlResponse(request, {
          ok: false,
          returnTo,
          message: bindResult.message || "第三方账号绑定失败",
          action: "bind",
          provider: targetProvider,
        });
        response.cookies.set("ko_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
        return response;
      }

      // 绑定成功：保留当前用户 Session，绝对不覆盖 Session Cookie
      const response = htmlResponse(request, {
        ok: true,
        returnTo,
        message: bindResult.message || `${targetProvider} 快捷登录绑定成功`,
        action: "bind",
        provider: targetProvider,
      });
      response.cookies.set("ko_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
      return response;
    }

    // 登录/注册模式
    const user = await createOAuthUser({
      provider: targetProvider,
      providerUserId: profile.id,
      email: profile.email,
      emailVerified: profile.emailVerified === true,
      displayName: profile.displayName,
      avatarUrl: profile.avatarUrl || profile.avatar,
      profile,
      ip,
    });
    if (user?.error) throw new Error(user.message || "账户已被封禁或异常");

    const session = await createSession(user.id);
    const isNewUser = Boolean(user.isNew);
    const response = htmlResponse(request, {
      ok: true,
      returnTo,
      action: "login",
      provider: targetProvider,
      isNew: isNewUser,
    });
    setSessionCookie(response, session.token, session.expires);
    response.cookies.set("ko_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    console.error(`[auth/oauth/${provider}]`, { code: error.code || "OAUTH_CALLBACK_FAILED", message: error.message });
    const response = htmlResponse(request, {
      ok: false,
      returnTo,
      message: error.message || "第三方登录失败，请重试",
      action: mode,
      provider,
    });
    response.cookies.set("ko_oauth_state", "", { httpOnly: true, path: "/", maxAge: 0 });
    return response;
  }
}
