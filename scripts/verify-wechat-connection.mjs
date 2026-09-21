#!/usr/bin/env node
/**
 * 微信支付官方 APIv3 Native 支付连通性与配置校验脚本
 * 用法:
 * node scripts/verify-wechat-connection.mjs
 * 或带参数:
 * node scripts/verify-wechat-connection.mjs --appId=wx123456 --mchId=1604517284 --v3Key=xxx --serialNo=xxx --keyPath=/path/to/key.pem
 */

import fs from 'node:fs';
import path from 'node:path';
import { getWechatProvider } from '../lib/payments/wechatProvider.js';

function parseArgs() {
  const args = process.argv.slice(2);
  const map = {};
  for (const arg of args) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) {
      map[match[1]] = match[2];
    }
  }
  return map;
}

const customArgs = parseArgs();
const appId = customArgs.appId || process.env.WECHAT_APP_ID;
const mchId = customArgs.mchId || process.env.WECHAT_MCH_ID || '1604517284';
const apiV3Key = customArgs.v3Key || process.env.WECHAT_API_V3_KEY;
const serialNo = customArgs.serialNo || process.env.WECHAT_CERT_SERIAL_NO || process.env.WECHAT_SERIAL_NO;
let privateKey = customArgs.privateKey || process.env.WECHAT_PRIVATE_KEY;
const keyPath = customArgs.keyPath || process.env.WECHAT_PRIVATE_KEY_PATH;

if (!privateKey && keyPath && fs.existsSync(keyPath)) {
  try {
    privateKey = fs.readFileSync(keyPath, 'utf8');
  } catch (err) {
    console.error(`[Error] 无法读取私钥文件 ${keyPath}:`, err.message);
  }
}

console.log('========================================================');
console.log('       微信支付商户号凭证与官方连通性审计工具');
console.log('========================================================');
console.log(`1. 商户号 (MCH_ID):        ${mchId || '【未配置】'}`);
console.log(`2. 关联 AppID:             ${appId || '【未配置】'}`);
console.log(`3. APIv3 密钥:             ${apiV3Key ? `${apiV3Key.slice(0, 4)}****${apiV3Key.slice(-4)} (长度: ${apiV3Key.length})` : '【未配置】'}`);
console.log(`4. 证书序列号:             ${serialNo || '【未配置】'}`);
console.log(`5. 商户私钥 (Private Key): ${privateKey ? '【已加载】' : '【未配置】'}`);
console.log('--------------------------------------------------------');

const issues = [];
if (!mchId) issues.push('缺失 商户号 (WECHAT_MCH_ID)');
if (!appId) issues.push('缺失 关联 AppID (WECHAT_APP_ID)');
if (!apiV3Key) {
  issues.push('缺失 APIv3 密钥 (WECHAT_API_V3_KEY)');
} else if (apiV3Key.length !== 32) {
  issues.push(`APIv3 密钥长度错误: 当前为 ${apiV3Key.length} 字符，必须正好为 32 字符`);
}
if (!serialNo) issues.push('缺失 证书序列号 (WECHAT_CERT_SERIAL_NO / WECHAT_SERIAL_NO)');
if (!privateKey) issues.push('缺失 商户私钥 (WECHAT_PRIVATE_KEY 或 WECHAT_PRIVATE_KEY_PATH)');

if (issues.length > 0) {
  console.log('❌ 凭证配置审计结果: 存在未满足的关键项！');
  issues.forEach((item, index) => {
    console.log(`   (${index + 1}) ${item}`);
  });
  console.log('\n⚠️ 当前系统处于 Mock 假支付模式，收银台展示的二维码为本地伪代码，扫码无法唤起真实支付！');
  console.log('========================================================\n');
  process.exit(1);
}

console.log('✅ 所有核心参数校验通过，开始尝试请求微信支付官方 V3 Native 接口...');

const provider = getWechatProvider({
  appId,
  mchId,
  apiV3Key,
  serialNo,
  privateKey,
});

async function runLiveTest() {
  const testOrderId = `test_audit_${Date.now()}`;
  try {
    const result = await provider.createCheckout({
      order: {
        id: testOrderId,
        amount_minor: 1, // 0.01 元测试
      },
      user: { id: 'audit_test_user' },
      plan: { id: 'audit_plan', name: '系统自检测试', monthlyUsd: 0.01 },
    });

    console.log('🎉 恭喜！微信官方 Native 预下单成功！');
    console.log(`- 测试订单号: ${result.id}`);
    console.log(`- 微信官方返回支付 code_url: ${result.code_url}`);
    console.log('✅ 官方组件对接完全正常，微信官方已受理下单！');
  } catch (err) {
    console.error('❌ 微信官方接口返回错误:');
    console.error(`- 错误状态码: ${err.status || err.statusCode}`);
    console.error(`- 错误代码: ${err.code}`);
    console.error(`- 详细信息: ${err.message}`);
    console.log('\n💡 常见错误排查建议:');
    console.log('  1. NOAUTH / 商户未开通Native支付: 请在商户平台【产品中心->我的产品】开通Native支付。');
    console.log('  2. APPID_MCHID_NOT_MATCH: 请在商户平台【产品中心->AppID账号管理】完成该 AppID 的关联授权。');
    console.log('  3. SIGN_ERROR: 证书序列号与私钥不匹配，或私钥内容不正确。');
  }
}

runLiveTest();
