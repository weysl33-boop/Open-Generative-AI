import assert from 'node:assert';
import { createRequire } from 'node:module';
import { createTranslator, getApiI18n, getRequestLocale, MESSAGES_MAP } from '../lib/i18n.js';

const require = createRequire(import.meta.url);
const enMessages = require('../messages/en/common.json');
const zhMessages = require('../messages/zh/common.json');
const jaMessages = require('../messages/ja-JP/common.json');
const koMessages = require('../messages/ko-KR/common.json');
const zhTwMessages = require('../messages/zh-TW/common.json');
const esMessages = require('../messages/es/common.json');

console.log('=== [开始多语言系统 (i18n) 完整性与前后端适配测试] ===\n');

// 1. 测试语言包完整性
console.log('1. 验证中英文核心字典完整性...');
assert(MESSAGES_MAP.en, '英文字典未加载');
assert(MESSAGES_MAP['zh-CN'], '简体中文字典未加载');
assert(MESSAGES_MAP['ja-JP'], '日文字典未加载');
assert(MESSAGES_MAP['ko-KR'], '韩文字典未加载');
assert(MESSAGES_MAP['zh-TW'], '繁体中文字典未加载');
assert(MESSAGES_MAP['es'], '西班牙文字典未加载');
assert.strictEqual(typeof enMessages.api.unauthorized, 'string');
assert.strictEqual(typeof zhMessages.api.unauthorized, 'string');
assert.strictEqual(typeof jaMessages.api.unauthorized, 'string');
assert.strictEqual(typeof koMessages.api.unauthorized, 'string');
assert.strictEqual(typeof zhTwMessages.api.unauthorized, 'string');
assert.strictEqual(typeof esMessages.api.unauthorized, 'string');
console.log('   ✓ 六种 Locale 核心字典已加载: en, zh-CN, ja-JP, ko-KR, zh-TW, es');

// 2. 测试翻译器与变量插值 (createTranslator)
console.log('\n2. 验证前端/服务端翻译函数与变量替换...');
const tEn = createTranslator('en');
const tZh = createTranslator('zh-CN');
const tJa = createTranslator('ja-JP');
const tKo = createTranslator('ko-KR');
const tZhTw = createTranslator('zh-TW');
const tEs = createTranslator('es');

assert.strictEqual(tEn('financial.kcoin'), 'Coin');
assert.strictEqual(tZh('financial.kcoin'), '硬币');
assert.strictEqual(tJa('financial.kcoin'), 'コイン');
assert.strictEqual(tKo('financial.kcoin'), '코인');
assert.strictEqual(tZhTw('financial.kcoin'), '硬幣');
assert.strictEqual(tEs('financial.kcoin'), 'Moneda');
assert.strictEqual(tEn('api.unauthorized'), 'Unauthorized, please login first');
assert.strictEqual(tZh('api.unauthorized'), '未授权，请先登录');
assert.strictEqual(tEs('api.unauthorized'), 'No autorizado, por favor inicia sesión primero');

const interpolatedZh = tZh('notifications.openResult', { label: '封面设计' });
assert.strictEqual(interpolatedZh, '打开 封面设计 的结果');
console.log('   ✓ 变量插值正确:', interpolatedZh);

// 3. 测试后端 API 语言探测能力 (getRequestLocale)
console.log('\n3. 验证后端 API 智能语言探测能力...');

// 3.1 从 Query 参数探测
const reqQuery = new Request('https://domain.com/api/test?lang=zh');
assert.strictEqual(getRequestLocale(reqQuery), 'zh-CN');
console.log('   ✓ Query ?lang=zh 探测成功 -> zh-CN');

// 3.2 从 x-locale 请求头探测
const reqHeader = new Request('https://domain.com/api/test', {
  headers: { 'x-locale': 'ja-JP' }
});
assert.strictEqual(getRequestLocale(reqHeader), 'ja-JP');
console.log('   ✓ Header x-locale 探测成功 -> ja-JP');

// 3.3 从 Cookie NEXT_LOCALE 探测
const reqCookie = new Request('https://domain.com/api/test', {
  headers: { 'cookie': 'foo=bar; NEXT_LOCALE=ko-KR; other=1' }
});
assert.strictEqual(getRequestLocale(reqCookie), 'ko-KR');
console.log('   ✓ Cookie NEXT_LOCALE 探测成功 -> ko-KR');

// 3.4 从 Accept-Language 标头探测
const reqAcceptZh = new Request('https://domain.com/api/test', {
  headers: { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' }
});
assert.strictEqual(getRequestLocale(reqAcceptZh), 'zh-CN');
console.log('   ✓ Accept-Language: zh-CN 探测成功 -> zh-CN');

const reqAcceptEn = new Request('https://domain.com/api/test', {
  headers: { 'accept-language': 'en-US,en;q=0.9' }
});
assert.strictEqual(getRequestLocale(reqAcceptEn), 'en');
console.log('   ✓ Accept-Language: en-US 探测成功 -> en');

// 4. 测试后端 API 路由真实调用与国际化返回
console.log('\n4. 模拟后端 API 多语言响应测试...');
const { t: apiZhT } = getApiI18n(reqAcceptZh);
const { t: apiEnT } = getApiI18n(reqAcceptEn);

assert.strictEqual(apiZhT('api.unauthorized'), '未授权，请先登录');
assert.strictEqual(apiEnT('api.unauthorized'), 'Unauthorized, please login first');
console.log('   ✓ 中文客户端报错返回:', apiZhT('api.unauthorized'));
console.log('   ✓ 英文客户端报错返回:', apiEnT('api.unauthorized'));

console.log('\n=== [全部多语言测试 100% 通过！] ===\n');
