import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  SOCIAL_LOGIN_CATALOG,
  getSocialLoginProviders,
  sanitizeSocialLoginConfig,
} from '../../lib/auth/socialProviders.js';
import { getSocialLoginRegion } from '../../lib/auth/socialRegion.js';
import { isExemptPath } from '../../lib/security/chinaIpGate.js';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('social login region is classified from the resolved client IP, not locale headers', () => {
  assert.equal(
    getSocialLoginRegion(new Headers({ 'x-real-ip': '1.0.1.1', 'accept-language': 'en-US' })),
    'mainland_china',
  );
  assert.equal(
    getSocialLoginRegion(new Headers({ 'x-real-ip': '8.8.8.8', 'cf-ipcountry': 'CN', 'x-country-code': 'CN' })),
    'international',
  );
});

test('mainland and international social providers remain separate products', () => {
  const mainland = getSocialLoginProviders('mainland_china');
  const international = getSocialLoginProviders('international');

  assert.deepEqual(mainland.map(({ id }) => id), ['wechat', 'qq', 'douyin']);
  assert.deepEqual(international.map(({ id }) => id), ['google', 'x', 'tiktok']);
  assert.notEqual(mainland.find(({ id }) => id === 'douyin')?.id, international.find(({ id }) => id === 'tiktok')?.id);
  assert.ok(mainland.every(({ available }) => available === true));
  assert.ok(international.every(({ available }) => available === true));
  assert.deepEqual(getSocialLoginProviders('unknown'), []);
});

test('the operator can hide a channel per region without touching the other region', () => {
  const config = sanitizeSocialLoginConfig({
    mainland_china: [{ id: 'qq', enabled: false }, { id: 'wechat', enabled: true }, { id: 'douyin', enabled: true }],
    international: [{ id: 'x', enabled: false }],
  });

  assert.deepEqual(
    getSocialLoginProviders('mainland_china', { config }).map(({ id }) => id),
    ['wechat', 'douyin'],
  );
  assert.deepEqual(
    getSocialLoginProviders('international', { config }).map(({ id }) => id),
    ['google', 'tiktok'],
  );
});

test('a channel without credentials is not offered, and unknown regions stay empty', () => {
  const providers = getSocialLoginProviders('international', {
    configured: { google: false, x: true, tiktok: true },
  });
  assert.deepEqual(providers.map(({ id }) => id), ['x', 'tiktok']);
  assert.deepEqual(getSocialLoginProviders('mars', { configured: {} }), []);
});

test('the stored region config cannot invent channels or leak one region into another', () => {
  const config = sanitizeSocialLoginConfig({
    mainland_china: ['google', 'wechat', 'wechat', { id: 'qq' }, { id: '../admin' }, 42, null],
    international: 'tiktok',
    eu: ['google'],
  });

  assert.deepEqual(config.mainland_china.map(({ id }) => id), ['wechat', 'qq', 'douyin']);
  assert.deepEqual(config.international.map(({ id }) => id), ['google', 'x', 'tiktok']);
  assert.equal(config.eu, undefined);
  // 未列出的渠道保持开启：漏传不能顺手把别人正在用的登录方式关掉。
  assert.ok(config.mainland_china.every((entry) => entry.enabled));
  assert.deepEqual(Object.keys(sanitizeSocialLoginConfig(null)), Object.keys(SOCIAL_LOGIN_CATALOG));
});

test('the public regional options endpoint is not blocked by the China IP gate', () => {
  assert.equal(isExemptPath('/api/auth/social-options'), true);
  assert.equal(isExemptPath('/api/auth/social-options/'), true);
  assert.equal(isExemptPath('/api/auth/social-options-extra'), false);
  assert.equal(isExemptPath('/api/auth/oauth/wechat'), true);
  assert.equal(isExemptPath('/api/auth/oauth/qq/callback'), true);
  assert.equal(isExemptPath('/api/auth/oauth/douyin/other'), false);
});

// app/api 路由进不了 node --test 的导入链，这里锁住三条只能静态验证的接线。
test('the regional options route reads the admin switch and never caches across regions', () => {
  const route = source('app/api/auth/social-options/route.js');

  assert.match(route, /getSocialLoginRegion\(request\.headers\)/);
  assert.match(route, /getSettingByKey\(SOCIAL_LOGIN_SETTING_KEY\)/);
  assert.match(route, /isOAuthProviderConfigured/);
  assert.match(route, /getSocialLoginProviders\(region,\s*\{[\s\S]*?config:[\s\S]*?configured,/);
  assert.match(route, /private, no-store/);
  assert.match(route, /Vary['"]?\s*:\s*'x-real-ip, cf-connecting-ip, x-forwarded-for'/);
});

test('the admin region switch requires idempotency and a complete payload', () => {
  const route = source('app/api/admin/login/social-regions/route.js');

  assert.match(route, /requirePermission\(request, PERMISSIONS\.providersWrite\)/);
  assert.match(route, /getRequiredIdempotencyKey/);
  assert.match(route, /checkIdempotency\(\{ scope: 'social_login_regions'/);
  assert.match(route, /saveSystemSetting/);
  assert.match(route, /key: SOCIAL_LOGIN_SETTING_KEY/);
  assert.match(route, /visibility: 'private'/);
  // 缺渠道的提交必须被拒绝，而不是把运营没提到的登录方式静默恢复。
  assert.match(route, /Array\.isArray\(submitted\[region\]\)/);
  assert.match(route, /submittedCount !== config\[region\]\.length/);
  assert.match(route, /preview/);
});

