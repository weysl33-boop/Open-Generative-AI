import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuthorizationUrl,
  createOAuthState,
  exchangeOAuthCode,
  fetchOAuthProfile,
  getOAuthProvider,
  readOAuthCallbackState,
  readOAuthState,
} from '../../lib/oauth.js';

process.env.OAUTH_STATE_SECRET = 'domestic-oauth-tests-only';

function credentials(provider) {
  return {
    ...getOAuthProvider(provider),
    resolvedClientId: `${provider}-app-id`,
    resolvedClientSecret: `${provider}-app-secret`,
  };
}

function jsonResponse(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('domestic authorization URLs use each platform protocol and do not leak the PKCE verifier', async () => {
  const cases = [
    {
      provider: 'wechat',
      hostname: 'open.weixin.qq.com',
      scope: 'snsapi_login',
      clientParam: 'appid',
      fragment: '#wechat_redirect',
    },
    {
      provider: 'qq',
      hostname: 'graph.qq.com',
      scope: 'get_user_info',
      clientParam: 'client_id',
      fragment: '',
    },
    {
      provider: 'douyin',
      hostname: 'open.douyin.com',
      scope: 'user_info',
      clientParam: 'client_key',
      fragment: '',
    },
  ];

  for (const item of cases) {
    const urlText = await buildAuthorizationUrl(
      item.provider,
      `https://app.example.test/api/auth/oauth/${item.provider}/callback`,
      'opaque-random-state',
      'private-pkce-verifier',
      credentials(item.provider),
    );
    const url = new URL(urlText);
    assert.equal(url.hostname, item.hostname);
    assert.equal(url.searchParams.get(item.clientParam), `${item.provider}-app-id`);
    assert.equal(url.searchParams.get('scope'), item.scope);
    assert.equal(url.searchParams.get('state'), 'opaque-random-state');
    assert.equal(url.searchParams.get('redirect_uri'), `https://app.example.test/api/auth/oauth/${item.provider}/callback`);
    assert.equal(url.searchParams.has('code_challenge'), false);
    assert.equal(url.hash, item.fragment);
    assert.equal(urlText.includes('private-pkce-verifier'), false);
  }

  const google = new URL(await buildAuthorizationUrl(
    'google', 'https://app.example.test/callback', 'opaque-state', 'private-verifier', credentials('google'),
  ));
  assert.equal(google.searchParams.get('code_challenge_method'), 'S256');
});

test('OAuth cookie state keeps verifier and binding data out of the provider-visible state parameter', () => {
  const created = createOAuthState({
    provider: 'qq',
    verifier: 'secret-verifier-value',
    returnTo: '/account?tab=profile',
    bindUserId: 'user-secret-id',
  });
  const state = readOAuthState(created.cookieValue);

  assert.ok(state);
  assert.equal(created.state, state.nonce);
  assert.equal(state.provider, 'qq');
  assert.equal(state.verifier, 'secret-verifier-value');
  assert.equal(state.bindUserId, 'user-secret-id');
  assert.equal(created.state.includes('secret-verifier-value'), false);
  assert.equal(created.state.includes('user-secret-id'), false);
  assert.equal(readOAuthState(`${created.cookieValue}tampered`), null);
  assert.equal(readOAuthCallbackState(created.cookieValue, created.state, 'qq')?.bindUserId, 'user-secret-id');
  assert.equal(readOAuthCallbackState(created.cookieValue, 'attacker-controlled-state', 'qq'), null);
  assert.equal(readOAuthCallbackState(created.cookieValue, created.state, 'douyin'), null);
});

test('WeChat authorization-code exchange uses the official GET query contract', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  let requestedUrl;
  let requestInit;
  globalThis.fetch = async (input, init) => {
    requestedUrl = new URL(String(input));
    requestInit = init;
    return jsonResponse({ access_token: 'wx-access', openid: 'wx-openid', unionid: 'wx-unionid' });
  };

  const token = await exchangeOAuthCode('wechat', 'one-time-code', 'https://app.example.test/callback', '', credentials('wechat'));
  assert.equal(requestInit.method, 'GET');
  assert.equal(requestedUrl.searchParams.get('appid'), 'wechat-app-id');
  assert.equal(requestedUrl.searchParams.get('secret'), 'wechat-app-secret');
  assert.equal(requestedUrl.searchParams.get('grant_type'), 'authorization_code');
  assert.equal(requestedUrl.searchParams.get('code'), 'one-time-code');
  assert.equal(token.unionid, 'wx-unionid');
  assert.equal((await fetchOAuthProfile('wechat', token)).id, 'wx-unionid');
});

test('QQ token, OpenID, and profile requests follow QQ Connect response shape', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname.endsWith('/token')) return jsonResponse({ access_token: 'qq-access', expires_in: 3600 });
    if (url.pathname.endsWith('/me')) return jsonResponse({ client_id: 'qq-app-id', openid: 'qq-openid' });
    return jsonResponse({ ret: 0, nickname: 'QQ昵称', figureurl_qq_2: 'https://img.example.test/qq.jpg' });
  };

  const token = await exchangeOAuthCode('qq', 'qq-code', 'https://app.example.test/qq-callback', '', credentials('qq'));
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].url.searchParams.get('client_id'), 'qq-app-id');
  assert.equal(calls[0].url.searchParams.get('client_secret'), 'qq-app-secret');
  assert.equal(calls[0].url.searchParams.get('fmt'), 'json');
  const profile = await fetchOAuthProfile('qq', token, credentials('qq'));
  assert.equal(profile.id, 'qq-openid');
  assert.equal(profile.displayName, 'QQ昵称');
  assert.equal(profile.avatarUrl, 'https://img.example.test/qq.jpg');
  assert.equal(calls[1].url.searchParams.get('fmt'), 'json');
  assert.equal(calls[2].url.searchParams.get('oauth_consumer_key'), 'qq-app-id');
  assert.equal(calls[2].url.searchParams.get('openid'), 'qq-openid');
});

test('Douyin uses its website OAuth endpoints and remains distinct from TikTok', async (t) => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    if (url.pathname.endsWith('/access_token/')) {
      return jsonResponse({ data: { access_token: 'dy-access', open_id: 'dy-open-id' }, err_no: 0 });
    }
    return jsonResponse({ data: { open_id: 'dy-open-id', nickname: '抖音昵称', avatar: 'https://img.example.test/douyin.jpg' }, err_no: 0 });
  };

  const token = await exchangeOAuthCode('douyin', 'douyin-code', 'https://app.example.test/douyin-callback', '', credentials('douyin'));
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].url.hostname, 'open.douyin.com');
  assert.match(String(calls[0].init.body), /client_key=douyin-app-id/);
  assert.match(String(calls[0].init.body), /client_secret=douyin-app-secret/);
  const profile = await fetchOAuthProfile('douyin', token, credentials('douyin'));
  assert.equal(profile.id, 'dy-open-id');
  assert.equal(profile.displayName, '抖音昵称');
  assert.equal(calls[1].url.pathname, '/oauth/userinfo/');
  assert.deepEqual(JSON.parse(calls[1].init.body), { access_token: 'dy-access', open_id: 'dy-open-id' });
  assert.equal(getOAuthProvider('tiktok').authorizeUrl, 'https://www.tiktok.com/v2/auth/authorize/');
  assert.notEqual(getOAuthProvider('douyin').authorizeUrl, getOAuthProvider('tiktok').authorizeUrl);
});
