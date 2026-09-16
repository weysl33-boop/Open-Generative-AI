import 'server-only';

import crypto from 'node:crypto';

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

export function getOAuthProvider(provider) {
  return PROVIDERS[String(provider || '').toLowerCase()] || null;
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

export function createOAuthState({ provider, verifier, returnTo }) {
  const payload = Buffer.from(JSON.stringify({
    provider,
    verifier,
    returnTo,
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

export function getRedirectUri(request, provider) {
  const origin = process.env.PUBLIC_APP_URL || request.nextUrl.origin;
  return `${origin.replace(/\/$/, '')}/api/auth/oauth/${provider}/callback`;
}

export function buildAuthorizationUrl(provider, redirectUri, state, verifier) {
  const config = getOAuthProvider(provider);
  if (!config || !isOAuthConfigured(provider)) throw new Error(`${provider} OAuth is not configured`);
  const url = new URL(config.authorizeUrl);
  url.searchParams.set('client_id', config.clientId());
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

export async function exchangeOAuthCode(provider, code, redirectUri, verifier) {
  const config = getOAuthProvider(provider);
  const form = new URLSearchParams({
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (provider === 'tiktok') form.set('client_key', config.clientId());
  else form.set('client_id', config.clientId());
  form.set('client_secret', config.clientSecret());

  const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
  if (provider === 'x') {
    headers.Authorization = `Basic ${Buffer.from(`${config.clientId()}:${config.clientSecret()}`).toString('base64')}`;
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

  if (provider === 'google') return { id: data.sub, email: data.email, displayName: data.name };
  if (provider === 'x') return { id: data.data?.id, email: data.data?.email || null, displayName: data.data?.name || data.data?.username };
  return { id: data.data?.user?.open_id || data.data?.user?.union_id, email: data.data?.user?.email || null, displayName: data.data?.user?.display_name };
}
