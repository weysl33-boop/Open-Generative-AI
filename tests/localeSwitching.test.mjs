import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeLocale, getLocaleConfig } from '../lib/locales.js';

test('normalizeLocale correctly handles aliases and standard BCP-47 codes', () => {
  assert.equal(normalizeLocale('zh'), 'zh-CN');
  assert.equal(normalizeLocale('zh-CN'), 'zh-CN');
  assert.equal(normalizeLocale('zh-cn'), 'zh-CN');
  assert.equal(normalizeLocale('en'), 'en');
  assert.equal(normalizeLocale('ja-JP'), 'ja-JP');
  assert.equal(normalizeLocale('ko-KR'), 'ko-KR');
  assert.equal(normalizeLocale('zh-TW'), 'zh-TW');
  assert.equal(normalizeLocale('es'), 'es');
  assert.equal(normalizeLocale('es-ES'), 'es');
  assert.equal(normalizeLocale('es-es'), 'es');
  assert.equal(normalizeLocale(''), 'en');
  assert.equal(normalizeLocale(null), 'en');
});

test('getLocaleConfig resolves rootPaths properly', () => {
  assert.equal(getLocaleConfig('en').rootPath, '');
  assert.equal(getLocaleConfig('zh-CN').rootPath, '/zh');
  assert.equal(getLocaleConfig('ja-JP').rootPath, '/ja-JP');
  assert.equal(getLocaleConfig('ko-KR').rootPath, '/ko-KR');
  assert.equal(getLocaleConfig('zh-TW').rootPath, '/zh-TW');
  assert.equal(getLocaleConfig('es').rootPath, '/es');
});

test('UserDropdownMenu correctly persists preference to database and handles safe navigation', async () => {
  const menuSource = await readFile(new URL('../components/UserDropdownMenu.js', import.meta.url), 'utf8');

  // 1. 验证不再有错误的 locale === 'zh' 死锁逻辑
  assert.ok(!menuSource.includes("const isZh = locale === 'zh';"), 'Must not have fragile isZh check');
  assert.ok(menuSource.includes('normalizeLocale'), 'Must import and use normalizeLocale');

  // 2. 验证绑定个人习惯，写入数据库
  assert.ok(menuSource.includes("fetch('/api/user/preferences'"), 'toggleLanguage must persist locale to database preferences API');
  assert.ok(menuSource.includes('NEXT_LOCALE='), 'Must set NEXT_LOCALE cookie');
  assert.ok(menuSource.includes('locale='), 'Must set locale cookie');

  // 3. 验证避免 /en/studio 404
  assert.ok(!menuSource.includes("pathname.replace(`/${locale}`, `/${nextLocale}`)"), 'Must not blindly replace locale with en causing 404');
});

test('Auth repository and service include locale in session query and user object', async () => {
  const authRepoSource = await readFile(new URL('../lib/repositories/auth.js', import.meta.url), 'utf8');
  const authServiceSource = await readFile(new URL('../lib/services/auth.js', import.meta.url), 'utf8');

  assert.ok(authRepoSource.includes('u.locale'), 'findUserSession must select u.locale');
  assert.ok(authServiceSource.includes('locale: row.locale'), 'getUserBySession must include locale property');
});

test('Root page performs smart redirect to localized studio', async () => {
  const pageSource = await readFile(new URL('../app/page.js', import.meta.url), 'utf8');

  assert.ok(pageSource.includes('getLocaleConfig'), 'Root page must use getLocaleConfig');
  assert.ok(pageSource.includes('normalizeLocale'), 'Root page must use normalizeLocale');
  assert.ok(pageSource.includes('redirect'), 'Root page must redirect intelligently');
});
