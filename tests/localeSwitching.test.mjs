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

test('语言切换只有一处实现，偏好入库与导航都在 lib/client/localeSwitch.js', async () => {
  const menuSource = await readFile(new URL('../components/UserDropdownMenu.js', import.meta.url), 'utf8');
  const switcherSource = await readFile(new URL('../components/LanguageSwitcher.js', import.meta.url), 'utf8');
  const switchSource = await readFile(new URL('../lib/client/localeSwitch.js', import.meta.url), 'utf8');

  // 两个消费方都只能委托，不允许再各自拷贝一份 cookie/导航逻辑。
  assert.ok(menuSource.includes('lib/client/localeSwitch'), 'UserDropdownMenu must delegate to localeSwitch');
  assert.ok(switcherSource.includes('lib/client/localeSwitch'), 'LanguageSwitcher must delegate to localeSwitch');
  assert.ok(!menuSource.includes('NEXT_LOCALE='), '切换逻辑不该留在菜单里');
  assert.ok(!switcherSource.includes("document.cookie = `locale="), '切换逻辑不该留在开关里');

  // 1. 验证不再有错误的 locale === 'zh' 死锁逻辑
  assert.ok(!menuSource.includes("const isZh = locale === 'zh';"), 'Must not have fragile isZh check');
  assert.ok(switchSource.includes('normalizeLocale'), 'localeSwitch must normalize the target before persisting');

  // 2. 验证绑定个人习惯（个人设置语言），持久化写入数据库
  assert.ok(switchSource.includes("fetch('/api/user/preferences'"), 'toggleLanguage must persist locale to database preferences API');
  assert.ok(switchSource.includes('NEXT_LOCALE='), 'Must set NEXT_LOCALE cookie');
  assert.ok(switchSource.includes('locale='), 'Must set locale cookie');

  // 3. 验证避免 /en/studio 404：没有本地化树的组合必须留在无前缀 URL，而不是拼个前缀出去
  assert.ok(!menuSource.includes("pathname.replace(`/${locale}`, `/${nextLocale}`)"), 'Must not blindly replace locale with en causing 404');
  assert.ok(switchSource.includes('LOCALIZED_PATHS'), 'Must consult the localized-route table instead of guessing prefixes');
});

test('切换只去真实存在的本地化路由，且当前语言标签由路径 + 偏好共同决定', async () => {
  const { stripLocalePrefix, localizedPathFor } = await import('../lib/client/localeSwitch.js');
  const { resolveClientLocale } = await import('../lib/locales.js');

  assert.equal(stripLocalePrefix('/zh/credits'), '/credits');
  assert.equal(stripLocalePrefix('/credits'), '/credits');
  assert.equal(stripLocalePrefix('/zh'), '/');

  // 只有 /zh 建了树：切去 zh 要导航，切去 ja-JP 必须留在无前缀 URL —— 造个 /ja-JP/credits 就是一发 404。
  assert.equal(localizedPathFor('/credits', 'zh-CN'), '/zh/credits');
  assert.equal(localizedPathFor('/credits', 'ja-JP'), null);
  assert.equal(localizedPathFor('/credits', 'en'), '/credits');
  assert.equal(localizedPathFor('/studio', 'ja-JP'), '/ja-JP/studio');

  // 无前缀页上 getLocaleFromPathname 恒返回 en，所以下拉框在 /credits 上永远显示错语言。
  assert.equal(resolveClientLocale({ pathname: '/credits', userLocale: 'ja-JP' }), 'ja-JP');
  assert.equal(resolveClientLocale({ pathname: '/zh/credits', userLocale: 'ja-JP' }), 'zh-CN');
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
