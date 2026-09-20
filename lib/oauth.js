import 'server-only';

import crypto from 'node:crypto';
import * as providerRepo from './repositories/providers.js';

const PROVIDERS = {
  google: {
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
    authorizeUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scopes: ['openid', 'email', 'profile'],
  },
  x: {
    clientId: () => process.env.X_CLIENT_ID,
    clientSecret: () => process.env.X_CLIENT_SECRET,
    authorizeUrl: 'https://twitter.com/i/oauth2/authorize',
    tokenUrl: 'https://api.x.com/2/oauth2/token',
    userInfoUrl: 'https://api.x.com/2/users/me?user.fields=profile_image_url',
    scopes: ['users.read', 'tweet.read', 'offline.access'],
  },
  tiktok: {
    clientId: () => process.env.TIKTOK_CLIENT_KEY,
    clientSecret: () => process.env.TIKTOK_CLIENT_SECRET,
    authorizeUrl: 'https://www.tiktok.com/v2/auth/authorize/',
    tokenUrl: 'https://open.tiktokapis.com/v2/oauth/token/',
    userInfoUrl: 'https://open.tiktokapis.com/v2/user/info/?fields=open_id,union_id,display_name,avatar_url',
    scopes: ['user.info.basic'],
  },
};

export async function getResolvedOAuthConfig(provider) {
  const p = String(provider || '').toLowerCase();
  const config = PROVIDERS[p];
  if (!config) return null;

  let clientId = null;
  let clientSecret = null;

  try {
    if (p === 'google') {
      clientId = (await providerRepo.getProviderSecret('google', 'client_id')) || process.env.GOOGLE_CLIENT_ID || null;
      clientSecret = (await providerRepo.getProviderSecret('google', 'client_secret')) || process.env.GOOGLE_CLIENT_SECRET || null;
    } else if (p === 'x') {
      clientId = (await providerRepo.getProviderSecret('x', 'client_id')) || process.env.X_CLIENT_ID || null;
      clientSecret = (await providerRepo.getProviderSecret('x', 'client_secret')) || process.env.X_CLIENT_SECRET || null;
    } else if (p === 'tiktok') {
      clientId = (await providerRepo.getProviderSecret('tiktok', 'client_key')) || process.env.TIKTOK_CLIENT_KEY || null;
      clientSecret = (await providerRepo.getProviderSecret('tiktok', 'client_secret')) || process.env.TIKTOK_CLIENT_SECRET || null;
    }
  } catch (err) {
    console.error(`[oauth] 获取 ${p} 数据库安全密钥失败，使用环境变量兜底:`, err.message);
    clientId = config.clientId();
    clientSecret = config.clientSecret();
  }

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
  const payload = Buffer.from(JSON.stringify({
    provider,
    verifier,
    returnTo,
    bindUserId,
    nonce: crypto.randomBytes(12).toString('hex'),
  })).toString('base64url');
  return `${payload}.${sign(payload)}`;
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
  if (provider === 'tiktok') {
    url.searchParams.set('client_key', clientId);
  } else {
    url.searchParams.set('client_id', clientId);
  }
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', createPkceChallenge(verifier));
  url.searchParams.set('code_challenge_method', 'S256');
  return url.toString();
}

async function parseResponse(response, label) {
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${label} failed (${response.status})`);
  return data;
}

export async function exchangeOAuthCode(provider, code, redirectUri, verifier, customConfig = null) {
  const config = customConfig || (await getResolvedOAuthConfig(provider)) || getOAuthProvider(provider);
  const clientId = config?.resolvedClientId || (typeof config?.clientId === 'function' ? config.clientId() : config?.clientId);
  const clientSecret = config?.resolvedClientSecret || (typeof config?.clientSecret === 'function' ? config.clientSecret() : config?.clientSecret);
  if (!config || !clientId || !clientSecret) throw new Error(`${provider} OAuth is not configured`);

  const form = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (provider === 'tiktok') form.set('client_key', clientId);
  else form.set('client_id', clientId);
  form.set('client_secret', clientSecret);

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (provider === 'x') {
    headers.Authorization = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
    form.delete('client_id');
    form.delete('client_secret');
  }
  return parseResponse(await fetch(config.tokenUrl, { method: 'POST', headers, body: form }), `${provider} token exchange`);
}

export async function fetchOAuthProfile(provider, accessToken) {
  const config = getOAuthProvider(provider);
  const data = await parseResponse(await fetch(config.userInfoUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }), `${provider} profile request`);

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
