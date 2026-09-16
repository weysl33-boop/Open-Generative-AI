import assert from 'node:assert';
import { execute, nowIso, randomId } from '../lib/db/index.js';
import { createSession, getEntitlements } from '../lib/billing.js';
import { rechargeCurrency } from '../lib/financial/index.js';

// 动态导入所有 API Handler
import { GET as getCurrencyWalletRoute } from '../app/api/financial/currency/wallet/route.js';
import { POST as setPayPasswordRoute } from '../app/api/financial/currency/password/route.js';
import { POST as transferCurrencyRoute } from '../app/api/financial/currency/transfer/route.js';
import { POST as exchangeCurrencyRoute } from '../app/api/financial/currency/exchange/route.js';

import { GET as getCreditWalletRoute } from '../app/api/financial/credits/wallet/route.js';
import { POST as checkinCreditRoute } from '../app/api/financial/credits/checkin/route.js';
import { POST as reserveCreditRoute } from '../app/api/financial/credits/reserve/route.js';
import { POST as commitCreditRoute } from '../app/api/financial/credits/commit/route.js';
import { POST as voidCreditRoute } from '../app/api/financial/credits/void/route.js';

console.log('=== [开始金融级 API 路由端到端仿真测试] ===');

function createMockRequest({ token, method = 'GET', body = null, headers = {} }) {
  const allHeaders = new Map(Object.entries(headers));
  if (token) {
    allHeaders.set('cookie', `ko_session=${token}`);
  }
  return {
    method,
    headers: {
      get: (k) => allHeaders.get(k.toLowerCase()) || null,
    },
    cookies: {
      get: (k) => (k === 'ko_session' ? { value: token } : null),
    },
    json: async () => body || {},
  };
}

async function main() {
  const now = nowIso();
  const user1 = `usr_api_1_${Date.now()}`;
  const user2 = `usr_api_2_${Date.now()}`;

  // 创建两个用户
  await execute(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt, role, credits, status, created_at)
    VALUES ($1, $2, 'API测试用户1', 'hash', 'salt', 'user', 0, 'active', $3),
           ($4, $5, 'API测试用户2', 'hash', 'salt', 'user', 0, 'active', $6)
  `, [user1, `${user1}@test.com`, now, user2, `${user2}@test.com`, now]);

  const session1 = await createSession(user1);
  const session2 = await createSession(user2);
  const token1 = session1.token;
  const token2 = session2.token;

  // 为用户 1 预充值 100 元 = 1000 K币
  await rechargeCurrency({
    userId: user1,
    amountCny: 100,
    channel: 'wechat',
    providerOrderId: `wx_${Date.now()}`,
    idempotencyKey: `rec_${randomId()}`,
  });

  console.log('\n1. 测试 GET /api/financial/currency/wallet 接口...');
  const reqWallet = createMockRequest({ token: token1 });
  const resWallet = await getCurrencyWalletRoute(reqWallet);
  const dataWallet = await resWallet.json();
  assert.strictEqual(resWallet.status, 200);
  assert.strictEqual(dataWallet.wallet.availableBalance, 1000);
  console.log(`   ✓ 成功获取 K 币钱包信息: 可用余额 ${dataWallet.wallet.availableBalance} 币，近期流水 ${dataWallet.recentTransactions.length} 条`);

  console.log('\n2. 测试 POST /api/financial/currency/password 接口 (设置支付密码)...');
  const reqPwd = createMockRequest({
    token: token1,
    method: 'POST',
    body: { password: 'safe_pin_888' },
  });
  const resPwd = await setPayPasswordRoute(reqPwd);
  const dataPwd = await resPwd.json();
  assert.strictEqual(resPwd.status, 200);
  assert.strictEqual(dataPwd.success, true);
  console.log('   ✓ 成功通过 API 设置 6 位以上安全支付密码');

  console.log('\n3. 测试 POST /api/financial/currency/transfer 接口 (转账 200 币给用户2)...');
  const reqTf = createMockRequest({
    token: token1,
    method: 'POST',
    body: {
      receiverId: user2,
      amount: 200,
      payPassword: 'safe_pin_888',
    },
  });
  const resTf = await transferCurrencyRoute(reqTf);
  const dataTf = await resTf.json();
  assert.strictEqual(resTf.status, 200);
  assert.strictEqual(dataTf.amount, 200);
  assert.strictEqual(dataTf.fee, 2); // 1% 手续费 = 2 币
  console.log(`   ✓ 转账成功！转出 200 币，手续费 2 币，用户1余额: ${dataTf.senderBalanceAfter} 币`);

  console.log('\n4. 测试 POST /api/financial/currency/exchange 接口 (K币兑换算力积分)...');
  const reqEx = createMockRequest({
    token: token1,
    method: 'POST',
    body: { type: 'credits', coinAmount: 100 },
  });
  const resEx = await exchangeCurrencyRoute(reqEx);
  const dataEx = await resEx.json();
  assert.strictEqual(resEx.status, 200);
  assert.strictEqual(dataEx.creditsGained, 1000); // 100币 = 1000 积分
  console.log(`   ✓ 兑换成功！消耗 100 K币，获得 1000 永久算力点，当前积分: ${dataEx.creditBalanceAfter}`);

  console.log('\n5. 测试 POST /api/financial/credits/checkin 接口 (每日签到)...');
  const reqCheckin = createMockRequest({ token: token1, method: 'POST' });
  const resCheckin = await checkinCreditRoute(reqCheckin);
  const dataCheckin = await resCheckin.json();
  assert.strictEqual(resCheckin.status, 200);
  assert.strictEqual(dataCheckin.rewardCredits, 10);
  console.log(`   ✓ 签到成功！领取 ${dataCheckin.rewardCredits} 每日免费积分`);

  console.log('\n6. 测试 GET /api/financial/credits/wallet 接口...');
  const reqCredWallet = createMockRequest({ token: token1 });
  const resCredWallet = await getCreditWalletRoute(reqCredWallet);
  const dataCredWallet = await resCredWallet.json();
  assert.strictEqual(resCredWallet.status, 200);
  assert.strictEqual(dataCredWallet.wallet.dailyFree, 10);
  assert.strictEqual(dataCredWallet.wallet.perpetualCredits, 1000);
  assert.strictEqual(dataCredWallet.wallet.totalAvailable, 1010);
  assert.strictEqual(dataCredWallet.wallet.isCheckedInToday, true);
  console.log(`   ✓ 多桶积分状态核验正确：每日 ${dataCredWallet.wallet.dailyFree} + 永久 ${dataCredWallet.wallet.perpetualCredits} = 总可用 ${dataCredWallet.wallet.totalAvailable}`);

  console.log('\n7. 测试 POST /api/financial/credits/reserve 与 void 接口 (预冻结与撤销)...');
  const reqReserve = createMockRequest({
    token: token1,
    method: 'POST',
    body: { amount: 20, modelId: 'kling-3.0-pro' },
  });
  const resReserve = await reserveCreditRoute(reqReserve);
  const dataReserve = await resReserve.json();
  assert.strictEqual(resReserve.status, 200);
  assert.strictEqual(dataReserve.status, 'RESERVED');
  assert.strictEqual(dataReserve.reservedAmount, 20);
  console.log(`   ✓ 预冻结成功，单号: ${dataReserve.reservationId}`);

  // 模拟撤销回滚
  const reqVoid = createMockRequest({
    token: token1,
    method: 'POST',
    body: { reservationId: dataReserve.reservationId, reason: '用户主动取消' },
  });
  const resVoid = await voidCreditRoute(reqVoid);
  const dataVoid = await resVoid.json();
  assert.strictEqual(resVoid.status, 200);
  assert.strictEqual(dataVoid.status, 'VOIDED');
  assert.strictEqual(dataVoid.refundedAmount, 20);
  console.log(`   ✓ 撤销回滚成功，解冻点数: ${dataVoid.refundedAmount}`);

  console.log('\n8. 测试 POST /api/financial/credits/reserve 与 commit 接口 (预冻结与确认结算)...');
  const resReserve2 = await reserveCreditRoute(reqReserve);
  const dataReserve2 = await resReserve2.json();

  const reqCommit = createMockRequest({
    token: token1,
    method: 'POST',
    body: { reservationId: dataReserve2.reservationId, creationId: 'cre_api_test_ok' },
  });
  const resCommit = await commitCreditRoute(reqCommit);
  const dataCommit = await resCommit.json();
  assert.strictEqual(resCommit.status, 200);
  assert.strictEqual(dataCommit.status, 'COMMITTED');
  console.log(`   ✓ 结算确认核销成功！`);

  console.log('\n9. 验证与现有系统的无缝集成 (getEntitlements)...');
  const entitlements = await getEntitlements(user1);
  assert.ok(entitlements.creditBuckets);
  assert.ok(entitlements.currencyWallet);
  assert.strictEqual(entitlements.credits, entitlements.creditBuckets.totalAvailable);
  console.log(`   ✓ 全局权益包含完整多桶结构与 K 币钱包：`);
  console.log(`     - 算力积分总计: ${entitlements.credits}`);
  console.log(`     - K 币钱包可用: ${entitlements.currencyWallet.availableBalance}`);

  console.log('\n=== [全部 9 项金融级 API 路由端到端测试 100% 成功！] ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('API 测试失败:', err);
  process.exit(1);
});
