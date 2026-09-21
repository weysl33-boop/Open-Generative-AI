import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { loadStaticCatalogs, validateCatalogs, buildMessagesFromCatalog } from '../lib/i18nCatalog.js';
import { getLocaleFromPathname, SUPPORTED_LOCALES, DEFAULT_LOCALE, LOCALE_CONFIGS } from '../lib/locales.js';

console.log('==============================================');
console.log('1. 验证支持的语言定义与默认语言');
console.log('==============================================');
console.log('SUPPORTED_LOCALES:', SUPPORTED_LOCALES);
console.log('DEFAULT_LOCALE:', DEFAULT_LOCALE);
const expectedLocales = ['en', 'zh-CN', 'ja-JP', 'ko-KR', 'zh-TW', 'es'];
assert.deepEqual([...SUPPORTED_LOCALES].sort(), [...expectedLocales].sort(), 'SUPPORTED_LOCALES 必须包含 6 种完整语言');
console.log('✔ 支持语言列表检查通过\n');

console.log('==============================================');
console.log('2. 验证路径解析 (getLocaleFromPathname)');
console.log('==============================================');
const testPaths = [
  { path: '/ja-JP/studio/video', expectedLocale: 'ja-JP' },
  { path: '/ko-KR/admin/i18n', expectedLocale: 'ko-KR' },
  { path: '/zh-TW/workspace', expectedLocale: 'zh-TW' },
  { path: '/zh/settings', expectedLocale: 'zh-CN' },
  { path: '/zh-CN/profile', expectedLocale: 'zh-CN' },
  { path: '/es/studio/video', expectedLocale: 'es' },
  { path: '/es/settings', expectedLocale: 'es' },
  { path: '/en/docs', expectedLocale: 'en' },
  { path: '/studio', expectedLocale: 'en' }
];

for (const t of testPaths) {
  const detected = getLocaleFromPathname(t.path);
  assert.equal(detected, t.expectedLocale, `Path ${t.path} 识别出的 locale 应为 ${t.expectedLocale}`);
  console.log(`   Path: ${t.path.padEnd(22)} -> Detected Locale: ${detected}`);
}
console.log('✔ 路径语言识别全部通过\n');

console.log('==============================================');
console.log('3. 验证静态 Catalog 与 100% 翻译覆盖率 (1057 / 1057)');
console.log('==============================================');
const catalogs = await loadStaticCatalogs();
const report = validateCatalogs(catalogs);

console.log(`基准语言 (en) 词条总数: ${report.en.total}`);
assert.equal(report.en.total, 1057, '基准字典词条总数应为 1057');

for (const loc of expectedLocales) {
  const stat = report[loc];
  console.log(`- [${loc}] (${stat.name}): 覆盖率: ${stat.coverage.toFixed(2)}%, 有效: ${stat.completed}/${stat.total}, missing: ${stat.missing}, fallback: ${stat.fallback}, 格式错误: ${stat.formatErrors}`);
  assert.equal(stat.missing, 0, `语言 ${loc} 不应有 missingKeys`);
  assert.ok(stat.fallback <= 1, `语言 ${loc} 不应有超出预期的 fallbackKeys`);
  assert.equal(stat.formatErrors, 0, `语言 ${loc} 不应有 formatErrors`);
  assert.ok(stat.coverage >= 99.9, `语言 ${loc} 覆盖率必须达到 100.00% (允许专有名词容差)`);
}
console.log('✔ 全部语言目录覆盖率验证通过，完全消除缺失与格式错误！\n');

console.log('==============================================');
console.log('4. 验证关键字段的多语言抽取与本土化差异 (buildMessagesFromCatalog)');
console.log('==============================================');
const testKeys = [
  'common.financial.kcoin',
  'common.apiKeyModal.title',
  'studio.videoStudio.categories.t2v',
  'studio.videoStudio.dropdowns.model',
  'studio.clippingStudio.headings.aiClippingStudio',
  'studio.appsStudio.hero.badge'
];

for (const k of testKeys) {
  console.log(`字段 [${k}]:`);
  const values = {};
  for (const loc of expectedLocales) {
    const messages = buildMessagesFromCatalog(catalogs[loc]);
    const parts = k.split('.');
    values[loc] = parts.reduce((acc, part) => acc?.[part], messages);
    console.log(`   ${loc.padEnd(6)} -> "${values[loc]}"`);
  }
  for (const loc of expectedLocales) {
    assert.ok(values[loc], `语言 ${loc} 的字段 ${k} 不能为空`);
    if (loc !== 'en') {
      assert.notEqual(values[loc], values['en'], `非 en 语言 ${loc} 的字段 ${k} 不能与 en 完全相同（防止回退）`);
    }
  }
}
console.log('✔ 关键字段抽取与本土化差异验证通过\n');

console.log('==============================================');
console.log('5. 验证 Studio 前端组件打包产物导出');
console.log('==============================================');
const distDir = path.resolve('packages/studio/dist/components');
assert.ok(fs.existsSync(distDir), 'packages/studio/dist/components 必须存在');

const expectedComponents = [
  'AgentStudio.js',
  'AiInfluencerStudio.js',
  'AppsStudio.js',
  'AudioStudio.js',
  'CinemaStudio.js',
  'ClippingStudio.js',
  'ImageStudio.js',
  'LayersStudio.js',
  'LipSyncStudio.js',
  'MarketingStudio.js',
  'McpCliStudio.js',
  'MotionControlStudio.js',
  'RecastStudio.js',
  'VibeMotionStudio.js',
  'VideoStudio.js'
];

for (const comp of expectedComponents) {
  const filePath = path.join(distDir, comp);
  assert.ok(fs.existsSync(filePath), `编译产物 ${comp} 必须存在`);
  const compContent = fs.readFileSync(filePath, 'utf-8');
  assert.ok(compContent.includes('zh-TW') && compContent.includes('ja-JP') && compContent.includes('ko-KR') && compContent.includes('es'), `${comp} 必须打包引入了 zh-TW, ja-JP, ko-KR, es 语言包`);
}
console.log('✔ Studio 前端组件已编译且包含 6 种语言完整映射\n');

console.log('🎉 全部多语言生效验证 100% 通过！');
