import assert from 'node:assert';
import { execute, nowIso, randomId, query } from '../lib/db/index.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';
import { reserveTestUserId } from './test-user-id-fixtures.mjs';
import { createSession } from '../lib/services/auth.js';
import { getEntitlements } from '../lib/services/billing.js';
import { CURRENCY, grantFeedbackRewardCoins, grantPerpetualCredits, getCurrencyWallet, getCreditWallet } from '../lib/financial/index.js';

// 动态导入所有 API Handler
import { GET as getCurrencyWalletRoute } from '../app/api/financial/currency/wallet/route.js';
import { POST as dailyLoginRoute } from '../app/api/financial/currency/daily-login/route.js';
import { POST as benefitRedeemRoute } from '../app/api/financial/currency/benefits/route.js';

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
  await assertSandboxDatabase();
  const now = nowIso();
  const user1 = await reserveTestUserId(query);

  await execute(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt, role, credits, status, created_at)
    VALUES ($1, $2, 'API测试用户1', 'hash', 'salt', 'user', 0, 'active', $3)
  `, [user1, `${user1}@test.com`, now]);

  const session1 = await createSession(user1);
  const token1 = session1.token;

  // 硬币无充值入口，用审核发币通道给用户 1 铺底 1000 枚
  await grantFeedbackRewardCoins({
    userId: user1,
    feedbackId: `fb_seed_${randomId()}`,
    amount: 1000,
    note: '测试种子额度',
  });
  // 算力与硬币已解耦，测试用算力只能由发放通道铺底
  const seedCredits = 100;
  await grantPerpetualCredits(user1, seedCredits, 'API 测试算力种子');

  console.log('\n1. 测试 GET /api/financial/currency/wallet 接口...');
  const reqWallet = createMockRequest({ token: token1 });
  const resWallet = await getCurrencyWalletRoute(reqWallet);
  const dataWallet = await resWallet.json();
  assert.strictEqual(resWallet.status, 200);
  assert.strictEqual(dataWallet.wallet.availableBalance, 1000);
  console.log(`   ✓ 成功获取硬币钱包信息: 可用余额 ${dataWallet.wallet.availableBalance} 币，近期流水 ${dataWallet.recentTransactions.length} 条`);

  console.log(`\n2. 测试 POST /api/financial/currency/daily-login 接口 (每日登录领 ${CURRENCY.DAILY_LOGIN_REWARD} 枚硬币)...`);
  const reqLogin = createMockRequest({ token: token1, method: 'POST' });
  const resLogin = await dailyLoginRoute(reqLogin);
  const dataLogin = await resLogin.json();
  assert.strictEqual(resLogin.status, 200);
  assert.strictEqual(dataLogin.amount, CURRENCY.DAILY_LOGIN_REWARD);
  console.log(`   ✓ 领取成功！余额 ${dataLogin.balance} 币`);

  console.log('\n3. 测试每日登录重复领取必须幂等 (不增发)...');
  const resLoginAgain = await dailyLoginRoute(createMockRequest({ token: token1, method: 'POST' }));
  const dataLoginAgain = await resLoginAgain.json();
  assert.strictEqual(resLoginAgain.status, 200);
  assert.strictEqual(dataLoginAgain.amount, 0);
  assert.strictEqual(dataLoginAgain.balance, dataLogin.balance);
  console.log(`   ✓ 二次领取被拦截，余额保持 ${dataLoginAgain.balance} 币`);

  console.log('\n4. 测试 POST /api/financial/currency/benefits 接口 (硬币兑换站内权益)...');
  const reqBenefit = createMockRequest({
    token: token1,
    method: 'POST',
    body: { benefitId: 'boost_24h' },
    headers: { 'x-idempotency-key': `idem_api_ben_${randomId()}` },
  });
  const resBenefit = await benefitRedeemRoute(reqBenefit);
  const dataBenefit = await resBenefit.json();
  assert.strictEqual(resBenefit.status, 200);
  assert.strictEqual(dataBenefit.benefitId, 'boost_24h');
  assert.strictEqual(dataBenefit.balanceAfter, 998);
  assert.ok(dataBenefit.priorityUntil, '加速卡必须返回生效截止时间');
  console.log(`   ✓ 加速卡消耗 3 枚硬币，余额 ${dataBenefit.balanceAfter} 币，优先至 ${dataBenefit.priorityUntil}`);

  console.log('\n4b. 验证硬币兑换算力通道已下架...');
  const creditsBefore = (await getCreditWallet(user1)).perpetualCredits;
  const resGone = await benefitRedeemRoute(createMockRequest({
    token: token1,
    method: 'POST',
    body: { benefitId: 'credits_5' },
    headers: { 'x-idempotency-key': `idem_api_gone_${randomId()}` },
  }));
  const dataGone = await resGone.json();
  assert.strictEqual(resGone.status, 400);
  assert.match(dataGone.error, /已下架/);
  assert.strictEqual((await getCurrencyWallet(user1)).availableBalance, 998, '被拒绝的兑换不能扣币');
  assert.strictEqual((await getCreditWallet(user1)).perpetualCredits, creditsBefore, '被拒绝的兑换不能到账算力');
  console.log(`   ✓ 历史算力项目返回 400「${dataGone.error}」，硬币与算力之间不再有换算通道`);

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
  assert.strictEqual(dataCredWallet.wallet.perpetualCredits, seedCredits);
  assert.strictEqual(dataCredWallet.wallet.totalAvailable, 10 + seedCredits);
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
  console.log(`   ✓ 全局权益包含完整多桶结构与硬币钱包：`);
  console.log(`     - 算力积分总计: ${entitlements.credits}`);
  console.log(`     - 硬币钱包可用: ${entitlements.currencyWallet.availableBalance}`);

  console.log('\n=== [全部 9 项金融级 API 路由端到端测试 100% 成功！] ===\n');
  process.exit(0);
}

main().catch(err => {
  console.error('API 测试失败:', err);
  process.exit(1);
});
