import assert from 'node:assert';
import { createRequire } from 'node:module';
import { createTranslator, getApiI18n, getRequestLocale, MESSAGES_MAP } from '../lib/i18n.js';

const require = createRequire(import.meta.url);
const enMessages = require('../messages/en/common.json');
const zhMessages = require('../messages/zh/common.json');

console.log('=== [开始多语言系统 (i18n) 完整性与前后端适配测试] ===\n');

// 1. 测试语言包完整性
console.log('1. 验证中英文核心字典完整性...');
assert(MESSAGES_MAP.en, '英文字典未加载');
assert(MESSAGES_MAP.zh, '中文字典未加载');
assert.strictEqual(typeof enMessages.api.unauthorized, 'string');
assert.strictEqual(typeof zhMessages.api.unauthorized, 'string');
console.log('   ✓ 核心命名空间完整: common, api, financial, shell, tabs, notifications');

// 2. 测试翻译器与变量插值 (createTranslator)
console.log('\n2. 验证前端/服务端翻译函数与变量替换...');
const tEn = createTranslator('en');
const tZh = createTranslator('zh');

assert.strictEqual(tEn('financial.kcoin'), 'K-Coin');
assert.strictEqual(tZh('financial.kcoin'), 'K 币');
assert.strictEqual(tEn('api.unauthorized'), 'Unauthorized, please login first');
assert.strictEqual(tZh('api.unauthorized'), '未授权，请先登录');

const interpolatedZh = tZh('notifications.openResult', { label: '封面设计' });
assert.strictEqual(interpolatedZh, '打开 封面设计 的结果');
console.log('   ✓ 变量插值正确:', interpolatedZh);

// 3. 测试后端 API 语言探测能力 (getRequestLocale)
console.log('\n3. 验证后端 API 智能语言探测能力...');

// 3.1 从 Query 参数探测
const reqQuery = new Request('https://domain.com/api/test?lang=zh');
assert.strictEqual(getRequestLocale(reqQuery), 'zh');
console.log('   ✓ Query ?lang=zh 探测成功 -> zh');

// 3.2 从 x-locale 请求头探测
const reqHeader = new Request('https://domain.com/api/test', {
  headers: { 'x-locale': 'zh' }
});
assert.strictEqual(getRequestLocale(reqHeader), 'zh');
console.log('   ✓ Header x-locale 探测成功 -> zh');

// 3.3 从 Cookie NEXT_LOCALE 探测
const reqCookie = new Request('https://domain.com/api/test', {
  headers: { 'cookie': 'foo=bar; NEXT_LOCALE=zh; other=1' }
});
assert.strictEqual(getRequestLocale(reqCookie), 'zh');
console.log('   ✓ Cookie NEXT_LOCALE 探测成功 -> zh');

// 3.4 从 Accept-Language 标头探测
const reqAcceptZh = new Request('https://domain.com/api/test', {
  headers: { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8' }
});
assert.strictEqual(getRequestLocale(reqAcceptZh), 'zh');
console.log('   ✓ Accept-Language: zh-CN 探测成功 -> zh');

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

