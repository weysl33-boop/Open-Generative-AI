import 'server-only';

import crypto from 'node:crypto';
import * as providerRepo from './repositories/providers.js';

const PROVIDERS = {
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    credentialProvider: 'google',
    credentialNames: { clientId: 'client_id', clientSecret: 'client_secret' },
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'email', 'profile'],
    usePkce: true,
  },
  x: {
    clientId: () => process.env.X_CLIENT_ID,
    clientSecret: () => process.env.X_CLIENT_SECRET,
    credentialProvider: 'x',
    credentialNames: { clientId: 'client_id', clientSecret: 'client_secret' },
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    userInfoUrl: 'https://api.x.com/2/users/me?user.fields=profile_image_url',
    scopes: ['users.read', 'tweet.read', 'offline.access'],
    usePkce: true,
  },
  tiktok: {
    clientId: () => process.env.TIKTOK_CLIENT_KEY,
    clientSecret: () => process.env.TIKTOK_CLIENT_SECRET,
    credentialProvider: 'tiktok',
    credentialNames: { clientId: 'client_key', clientSecret: 'client_secret' },
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    userInfoUrl: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url',
    scopes: ['user.info.basic'],
    usePkce: true,
  },
  wechat: {
    clientId: () => process.env.WECHAT_OAUTH_APP_ID,
    clientSecret: () => process.env.WECHAT_OAUTH_APP_SECRET,
    credentialProvider: 'wechat_oauth',
    credentialNames: { clientId: 'app_id', clientSecret: 'app_secret' },
    authorizeUrl: 'https://open.weixin.qq.com/connect/qrconnect',
    tokenUrl: 'https://api.weixin.qq.com/sns/oauth2/access_token',
    scopes: ['snsapi_login'],
    authorizeClientParam: 'appid',
    usePkce: false,
    authorizeFragment: 'wechat_redirect',
    tokenRequest: 'wechat',
  },
  qq: {
    clientId: () => process.env.QQ_APP_ID,
    clientSecret: () => process.env.QQ_APP_KEY,
    credentialProvider: 'qq',
    credentialNames: { clientId: 'app_id', clientSecret: 'app_key' },
    authorizeUrl: 'https://graph.qq.com/oauth2.0/authorize',
    tokenUrl: 'https://graph.qq.com/oauth2.0/token',
    openIdUrl: 'https://graph.qq.com/oauth2.0/me',
    userInfoUrl: 'https://graph.qq.com/user/get_user_info',
    scopes: ['get_user_info'],
    usePkce: false,
    tokenRequest: 'qq',
  },
  douyin: {
    clientId: () => process.env.DOUYIN_CLIENT_KEY,
    clientSecret: () => process.env.DOUYIN_CLIENT_SECRET,
    credentialProvider: 'douyin',
    credentialNames: { clientId: 'client_key', clientSecret: 'client_secret' },
    authorizeUrl: 'https://open.douyin.com/platform/oauth/connect',
    tokenUrl: 'https://open.douyin.com/oauth/access_token/',
    userInfoUrl: 'https://open.douyin.com/oauth/userinfo/',
    scopes: ['user_info'],
    authorizeClientParam: 'client_key',
    usePkce: false,
    tokenRequest: 'douyin',
  },
};

export async function getResolvedOAuthConfig(provider) {
  const p = String(provider || '').toLowerCase();
  const config = PROVIDERS[p];
  if (!config) return null;

  let storedClientId = null;
  let storedClientSecret = null;
  try {
    [storedClientId, storedClientSecret] = await Promise.all([
      providerRepo.getProviderSecret(config.credentialProvider, config.credentialNames.clientId),
      providerRepo.getProviderSecret(config.credentialProvider, config.credentialNames.clientSecret),
    ]);
  } catch (err) {
    // Do not log credential values or provider response bodies.
    console.error(`[oauth] encrypted credential lookup failed for ${p}:`, err.code || err.message);
  }

  const clientId = storedClientId || config.clientId() || null;
  const clientSecret = storedClientSecret || config.clientSecret() || null;

  return {
    ...config,
    resolvedClientId: clientId,
    resolvedClientSecret: clientSecret,
    configured: Boolean(clientId && clientSecret),
  };
}

export function getOAuthProvider(provider) {
  return PROVIDERS[String(provider || '').toLowerCase()] || null;
}

export async function isOAuthProviderConfigured(provider) {
  const resolved = await getResolvedOAuthConfig(provider);
  return Boolean(resolved?.configured);
}

export function isOAuthConfigured(provider) {
  const config = getOAuthProvider(provider);
  return Boolean(config?.clientId() && config?.clientSecret());
}

function stateSecret() {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.BILLING_SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === 'production') throw new Error('OAUTH_STATE_SECRET is not configured');
  return secret || 'development-only-oauth-state-secret';
}

function sign(value) {
  return crypto.createHmac('sha256', stateSecret()).update(value).digest('base64url');
}

export function createOAuthState({ provider, verifier, returnTo, bindUserId = null }) {
  const nonce = crypto.randomBytes(24).toString('base64url');
  const payload = Buffer.from(JSON.stringify({
    provider,
    verifier,
    returnTo,
    bindUserId,
    nonce,
  })).toString('base64url');
  // Keep verifier, return URL, and binding user ID in the HttpOnly cookie only.
  // The provider sees just a random opaque state value.
  return { cookieValue: `${payload}.${sign(payload)}`, state: nonce };
}

export function readOAuthState(value) {
  try {
    const [payload, signature] = String(value || '').split('.');
    if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

export function readOAuthCallbackState(cookieValue, returnedState, provider) {
  const state = readOAuthState(cookieValue);
  if (!state || state.provider !== provider || !state.nonce || state.nonce !== returnedState) return null;
  return state;
}

export function createPkceVerifier() {
  return crypto.randomBytes(48).toString('base64url');
}

export function createPkceChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// nginx 用 proxy_pass 转发到 127.0.0.1:3100 且没有回传对外 Host，所以线上
// request.url / nextUrl.origin 恒为 https://localhost:3100。任何要交给浏览器的绝对地址
// （重定向目标、postMessage 的 targetOrigin）都必须经这里取，否则第三方登录会把用户
// 送到一个打不开的本机地址，弹窗侧则会因 targetOrigin 不匹配而静默丢弃消息。
export function getPublicAppOrigin(request) {
  const configured = String(process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) return configured;
  const forwardedHost = request?.headers?.get?.('x-forwarded-host');
  if (forwardedHost) {
    const proto = request?.headers?.get?.('x-forwarded-proto')?.split(',')[0]?.trim() || 'https';
    return `${proto}://${forwardedHost.split(',')[0].trim()}`;
  }
  return request?.nextUrl?.origin || 'https://www.koyosim.com';
}

export function getRedirectUri(request, provider) {
  return `${getPublicAppOrigin(request)}/api/auth/oauth/${provider}/callback`;
}

export async function buildAuthorizationUrl(provider, redirectUri, state, verifier, customConfig = null) {
  const config = customConfig || (await getResolvedOAuthConfig(provider)) || getOAuthProvider(provider);
  const clientId = config?.resolvedClientId || (typeof config?.clientId === 'function' ? config.clientId() : config?.clientId);
  if (!config || !clientId) throw new Error(`${provider} OAuth is not configured`);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set(config.authorizeClientParam || (provider === 'tiktok' ? 'client_key' : 'client_id'), clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(config.scopeSeparator || ' '));
  url.searchParams.set('state', state);
  if (config.usePkce !== false) {
    url.searchParams.set('code_challenge', createPkceChallenge(verifier));
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return `${url.toString()}${config.authorizeFragment ? `#${config.authorizeFragment}` : ''}`;
}

async function parseResponse(response, label) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${label} failed (${response.status})`);
  if (!data || typeof data !== 'object') throw new Error(`${label} returned an invalid response`);
  return data;
}

function assertProviderSuccess(provider, data) {
  const errorCode = data?.errcode ?? data?.err_no ?? data?.data?.error_code ?? data?.error?.code;
  if (errorCode !== undefined && String(errorCode) !== '0') {
    throw new Error(`${provider} rejected the OAuth request (${String(errorCode).slice(0, 32)})`);
  }
  if (data?.error) throw new Error(`${provider} rejected the OAuth request`);
  return data;
}

function tokenFields(tokenResponse) {
  return tokenResponse?.data && typeof tokenResponse.data === 'object'
    ? tokenResponse.data
    : tokenResponse;
}

export async function exchangeOAuthCode(provider, code, redirectUri, verifier, customConfig = null) {
  const config = customConfig || (await getResolvedOAuthConfig(provider)) || getOAuthProvider(provider);
  const clientId = config?.resolvedClientId || (typeof config?.clientId === 'function' ? config.clientId() : config?.clientId);
  const clientSecret = config?.resolvedClientSecret || (typeof config?.clientSecret === 'function' ? config.clientSecret() : config?.clientSecret);
  if (!config || !clientId || !clientSecret) throw new Error(`${provider} OAuth is not configured`);

  if (provider === 'wechat') {
    const url = new URL(config.tokenUrl);
    url.searchParams.set('appid', clientId);
    url.searchParams.set('secret', clientSecret);
    url.searchParams.set('code', code);
    url.searchParams.set('grant_type', 'authorization_code');
    const data = assertProviderSuccess(provider, await parseResponse(
      await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(10000) }),
      `${provider} token exchange`,
    ));
    if (!data.openid) throw new Error('wechat token response did not include openid');
    return data;
  }

  if (provider === 'qq') {
    const url = new URL(config.tokenUrl);
    url.searchParams.set('grant_type', 'authorization_code');
    url.searchParams.set('client_id', clientId);
    url.searchParams.set('client_secret', clientSecret);
    url.searchParams.set('code', code);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('fmt', 'json');
    const data = assertProviderSuccess(provider, await parseResponse(
      await fetch(url, { method: 'GET', cache: 'no-store', signal: AbortSignal.timeout(10000) }),
      `${provider} token exchange`,
    ));
    if (!data.access_token) throw new Error('qq token response did not include access_token');
    return data;
  }

  if (provider === 'douyin') {
    const form = new URLSearchParams({
      client_key: clientId,
      client_secret: clientSecret,
      code,
      grant_type: 'authorization_code',
    });
    const data = assertProviderSuccess(provider, await parseResponse(
      await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: form,
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }),
      `${provider} token exchange`,
    ));
    if (!data.data?.access_token || !data.data?.open_id) throw new Error('douyin token response is missing the user token or open_id');
    return data;
  }

  const form = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
  });
  if (config.usePkce !== false) form.set('code_verifier', verifier);
  if (provider === 'tiktok') form.set('client_key', clientId);
  else form.set('client_id', clientId);
  form.set('client_secret', clientSecret);

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (provider === 'x') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    form.delete('client_id');
    form.delete('client_secret');
  }
  return assertProviderSuccess(provider, await parseResponse(
    await fetch(config.tokenUrl, { method: 'POST', headers, body: form, cache: 'no-store', signal: AbortSignal.timeout(10000) }),
    `${provider} token exchange`,
  ));
}

export async function fetchOAuthProfile(provider, tokenResponse, customConfig = null) {
  const config = customConfig || getOAuthProvider(provider);
  const token = tokenFields(tokenResponse);
  const accessToken = token?.access_token;

  if (provider === 'wechat') return {
    id: token.unionid || token.openid,
    email: null,
    emailVerified: false,
    displayName: '微信用户',
    avatarUrl: null,
  };

  if (provider === 'qq') {
    if (!accessToken) throw new Error('qq token response did not include access_token');
    const openIdUrl = new URL(config.openIdUrl);
    openIdUrl.searchParams.set('access_token', accessToken);
    openIdUrl.searchParams.set('fmt', 'json');
    const openIdData = assertProviderSuccess(provider, await parseResponse(
      await fetch(openIdUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) }),
      `${provider} openid request`,
    ));
    if (!openIdData.openid) throw new Error('qq openid response did not include openid');

    const clientId = config?.resolvedClientId || (typeof config?.clientId === 'function' ? config.clientId() : config?.clientId);
    const userInfoUrl = new URL(config.userInfoUrl);
    userInfoUrl.searchParams.set('access_token', accessToken);
    userInfoUrl.searchParams.set('oauth_consumer_key', clientId);
    userInfoUrl.searchParams.set('openid', openIdData.openid);
    const user = assertProviderSuccess(provider, await parseResponse(
      await fetch(userInfoUrl, { cache: 'no-store', signal: AbortSignal.timeout(10000) }),
      `${provider} profile request`,
    ));
    if (Number(user.ret) !== 0) throw new Error(`qq profile request failed (${String(user.ret).slice(0, 32)})`);
    return {
      id: openIdData.openid,
      email: null,
      emailVerified: false,
      displayName: user.nickname || 'QQ 用户',
      avatarUrl: user.figureurl_qq_2 || user.figureurl_qq_1 || user.figureurl_2 || null,
    };
  }

  if (provider === 'douyin') {
    if (!accessToken || !token.open_id) throw new Error('douyin token response is missing the user token or open_id');
    const data = assertProviderSuccess(provider, await parseResponse(
      await fetch(config.userInfoUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: accessToken, open_id: token.open_id }),
        cache: 'no-store',
        signal: AbortSignal.timeout(10000),
      }),
      `${provider} profile request`,
    ));
    const user = data.data || {};
    if (String(user.error_code ?? '0') !== '0') throw new Error(`douyin profile request failed (${String(user.error_code).slice(0, 32)})`);
    return {
      id: user.open_id || token.open_id,
      email: null,
      emailVerified: false,
      displayName: user.nickname || '抖音用户',
      avatarUrl: user.avatar || null,
    };
  }

  const data = assertProviderSuccess(provider, await parseResponse(await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: 'no-store',
    signal: AbortSignal.timeout(10000),
  }), `${provider} profile request`));

  if (provider === 'google') return {
    id: data.sub,
    email: data.email,
    emailVerified: data.email_verified === true,
    displayName: data.name,
    avatarUrl: data.picture || null,
  };
  if (provider === 'x') return {
    id: data.data?.id,
    email: data.data?.email || null,
    emailVerified: false,
    displayName: data.data?.name || data.data?.username,
    avatarUrl: data.data?.profile_image_url || null,
  };
  return {
    id: data.data?.user?.open_id || data.data?.user?.union_id,
    email: data.data?.user?.email || null,
    emailVerified: false,
    displayName: data.data?.user?.display_name,
    avatarUrl: data.data?.user?.avatar_url || null,
  };
}
