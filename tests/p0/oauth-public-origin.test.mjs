import test from 'node:test';
import assert from 'node:assert/strict';

// nginx 以 proxy_pass 转发到 127.0.0.1:3100 且未回传对外 Host，Next 看到的
// request.url / nextUrl.origin 因此恒为内网地址。任何交给浏览器的绝对地址都必须
// 经 getPublicAppOrigin 取，否则第三方登录会把用户送到打不开的 localhost:3100，
// 弹窗侧也会因 postMessage targetOrigin 不匹配而静默丢弃结果。
function fakeRequest({ url, headers = {} }) {
  const entries = Object.entries(headers).map(([k, v]) => [k, String(v)]);
  return {
    url,
    nextUrl: new URL(url),
    headers: { get: (name) => entries.find(([k]) => k === name.toLowerCase())?.[1] ?? null },
  };
}

const INTERNAL = 'http://127.0.0.1:3100/api/auth/oauth/google/callback';

test('P0 public app origin ignores the internal upstream origin', async () => {
  const { getPublicAppOrigin, getRedirectUri } = await import('../../lib/oauth.js');
  const request = fakeRequest({ url: INTERNAL });
  const previous = process.env.PUBLIC_APP_URL;
  try {
    process.env.PUBLIC_APP_URL = 'https://www.koyosim.com/';
    assert.equal(getPublicAppOrigin(request), 'https://www.koyosim.com');
    assert.equal(getRedirectUri(request, 'google'), 'https://www.koyosim.com/api/auth/oauth/google/callback');

    // 未配置 PUBLIC_APP_URL 时退回到代理回传的对外 Host。
    delete process.env.PUBLIC_APP_URL;
    const forwarded = fakeRequest({
      url: INTERNAL,
      headers: { 'x-forwarded-host': 'koyosim.com, www.koyosim.com', 'x-forwarded-proto': 'https,https' },
    });
    assert.equal(getPublicAppOrigin(forwarded), 'https://koyosim.com');

    // 本地开发没有任何对外信息时保持源站地址可用，不能被硬编码域名劫持。
    const dev = fakeRequest({ url: 'http://localhost:3000/api/auth/oauth/google/callback' });
    assert.equal(getPublicAppOrigin(dev), 'http://localhost:3000');
  } finally {
    if (previous === undefined) delete process.env.PUBLIC_APP_URL;
    else process.env.PUBLIC_APP_URL = previous;
  }
});

test('P0 legacy auth aliases and /login forward with a relative Location', async () => {
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  const root = path.resolve(process.cwd());
  const files = [
    'app/login/route.js',
    'app/auth/[provider]/callback/route.js',
    'app/auth/tiktok/route.js',
  ];
  for (const relative of files) {
    const source = await fs.readFile(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /NextResponse\.redirect\(/, `${relative} must not build an absolute redirect`);
    assert.match(source, /headers:\s*\{\s*location\b/, `${relative} must redirect relatively`);
  }
});
