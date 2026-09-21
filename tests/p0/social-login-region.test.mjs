import test from 'node:test';
import assert from 'node:assert/strict';
import { getSocialLoginProviders } from '../../lib/auth/socialProviders.js';
import { getSocialLoginRegion } from '../../lib/auth/socialRegion.js';
import { isExemptPath } from '../../lib/security/chinaIpGate.js';

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

test('the public regional options endpoint is not blocked by the China IP gate', () => {
  assert.equal(isExemptPath('/api/auth/social-options'), true);
  assert.equal(isExemptPath('/api/auth/social-options/'), true);
  assert.equal(isExemptPath('/api/auth/social-options-extra'), false);
  assert.equal(isExemptPath('/api/auth/oauth/wechat'), true);
  assert.equal(isExemptPath('/api/auth/oauth/qq/callback'), true);
  assert.equal(isExemptPath('/api/auth/oauth/douyin/other'), false);
});
