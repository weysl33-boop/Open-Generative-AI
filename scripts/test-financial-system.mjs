import assert from 'node:assert';
import {
  getCurrencyWallet,
  grantFeedbackRewardCoins,
  claimDailyLoginCoin,
  getCreditWallet,
  dailyCheckIn,
  reserveCredits,
  commitCredits,
  voidCredits,
  redeemBenefit,
  runDailyReconciliation,
  grantPerpetualCredits,
  CURRENCY
} from '../lib/financial/index.js';
import { execute, nowIso, randomId, query } from '../lib/db/index.js';
import { assertSandboxDatabase } from './require-sandbox-db.mjs';
import { reserveTestUserId } from './test-user-id-fixtures.mjs';

console.log('=== [开始金融级系统核心测试套件] ===');

async function main() {
  await assertSandboxDatabase();
  const now = nowIso();
  const userA = await reserveTestUserId(query);

  // 创建一个测试用户
  await execute(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt, role, credits, status, created_at)
    VALUES ($1, $2, '测试用户A', 'fakehash', 'fakesalt', 'user', 0, 'active', $3)
  `, [userA, `${userA}@test.com`, now]);

  console.log(`\n1. 测试审核发币通道 (复式分录) 与幂等防双发...`);
  const feedbackId = `fb_test_${randomId()}`;
  const grantRes = await grantFeedbackRewardCoins({
    userId: userA,
    feedbackId,
    amount: 500,
    note: '测试采纳发放',
  });
  assert.strictEqual(grantRes.amount, 500);

  const walletA = await getCurrencyWallet(userA);
  assert.strictEqual(walletA.availableBalance, 500);

  // 同一笔建议重复发放必须命中幂等键，不铸造第二笔
  const grantAgain = await grantFeedbackRewardCoins({ userId: userA, feedbackId, amount: 500 });
  assert.strictEqual(grantAgain.idempotent, true);
  assert.strictEqual((await getCurrencyWallet(userA)).availableBalance, 500);
  console.log(`   ✓ 发放 500 枚硬币成功，重复发放已被幂等拦截，余额仍为 ${walletA.availableBalance} 枚`);

  console.log(`\n2. 测试每日登录领取 ${CURRENCY.DAILY_LOGIN_REWARD} 枚硬币与当日判重...`);
  const loginRes = await claimDailyLoginCoin(userA);
  assert.strictEqual(loginRes.amount, CURRENCY.DAILY_LOGIN_REWARD);
  const loginAgain = await claimDailyLoginCoin(userA);
  assert.strictEqual(loginAgain.amount, 0);
  const walletAfterLogin = await getCurrencyWallet(userA);
  assert.strictEqual(walletAfterLogin.availableBalance, 501);
  console.log(`   ✓ 首次登录入账 ${CURRENCY.DAILY_LOGIN_REWARD} 枚，二次领取归零，余额 ${walletAfterLogin.availableBalance} 枚`);

  console.log(`\n3. 测试硬币兑换站内权益，且不触碰算力账户...`);
  const baseCredits = 50;
  await grantPerpetualCredits(userA, baseCredits, '测试算力种子额度');

  const redeemRes = await redeemBenefit({
    userId: userA,
    benefitId: 'boost_24h',
    idempotencyKey: `ben_${randomId()}`,
  });
  assert.strictEqual(redeemRes.result.balanceAfter, 448);
  assert.strictEqual((await getCreditWallet(userA)).perpetualCredits, baseCredits, '权益兑换不得改动算力余额');
  console.log(`   ✓ 加速卡消耗 3 枚硬币，算力余额仍为 ${baseCredits} 点`);

  await assert.rejects(
    () => redeemBenefit({ userId: userA, benefitId: 'credits_5', idempotencyKey: `ben_${randomId()}` }),
    /已下架/,
    '硬币兑换算力通道必须已下架'
  );
  assert.strictEqual((await getCurrencyWallet(userA)).availableBalance, 448, '被拒绝的下架项目不能扣币');
  console.log(`   ✓ 历史算力兑换项目已被拒绝，硬币与算力之间不再有任何换算通道`);

  console.log(`\n4. 测试每日签到与多桶 FIFO 优先级扣除...`);
  // 每日签到获得 10 每日点数
  const checkinRes = await dailyCheckIn(userA);
  assert.strictEqual(checkinRes.rewardCredits, 10);
  const creditsAAfterCheckin = await getCreditWallet(userA);
  assert.strictEqual(creditsAAfterCheckin.dailyFree, 10);
  assert.strictEqual(creditsAAfterCheckin.perpetualCredits, baseCredits);
  assert.strictEqual(creditsAAfterCheckin.totalAvailable, baseCredits + 10);
  console.log(`   ✓ 每日签到成功，当前每日积分: ${creditsAAfterCheckin.dailyFree}，永久积分: ${creditsAAfterCheckin.perpetualCredits}`);

  console.log(`\n5. 测试 AI 算力两阶段预冻结与撤销回滚 (Reserve -> Void)...`);
  // 预扣 15 积分 (应优先扣除 10 每日积分 + 5 永久积分)
  const reserve1 = await reserveCredits({
    userId: userA,
    amount: 15,
    modelId: 'minimax-hailuo-2.3',
    idempotencyKey: `res_${randomId()}`,
  });
  assert.strictEqual(reserve1.split.daily, 10);
  assert.strictEqual(reserve1.split.perpetual, 5);

  const walletDuringReserve1 = await getCreditWallet(userA);
  assert.strictEqual(walletDuringReserve1.dailyFree, 0);
  assert.strictEqual(walletDuringReserve1.perpetualCredits, baseCredits - 5);
  assert.strictEqual(walletDuringReserve1.frozenCredits, 15);
  console.log(`   ✓ Phase 1: 预冻结 15 积分成功！冻结金额: ${walletDuringReserve1.frozenCredits}，可用剩余: ${walletDuringReserve1.totalAvailable}`);

  // 模拟任务失败，调用 Void 原路全额解冻
  const voidRes = await voidCredits({
    reservationId: reserve1.reservationId,
    reason: '下流引擎 504 网关超时',
  });
  assert.strictEqual(voidRes.refundedAmount, 15);

  const walletAfterVoid = await getCreditWallet(userA);
  assert.strictEqual(walletAfterVoid.dailyFree, 10);
  assert.strictEqual(walletAfterVoid.perpetualCredits, baseCredits);
  assert.strictEqual(walletAfterVoid.frozenCredits, 0);
  console.log(`   ✓ Phase 2B: 任务失败原路全额解冻成功！每日积分复原为 10，永久积分复原为 ${baseCredits}，冻结归 0`);

  console.log(`\n6. 测试 AI 算力两阶段预扣与确认结算 (Reserve -> Commit)...`);
  const reserve2 = await reserveCredits({
    userId: userA,
    amount: 12,
    modelId: 'flux-1.1-pro',
    idempotencyKey: `res_${randomId()}`,
  });
  const commitRes = await commitCredits({
    reservationId: reserve2.reservationId,
    creationId: 'cre_test_success_123',
  });
  assert.strictEqual(commitRes.status, 'COMMITTED');

  const walletAfterCommit = await getCreditWallet(userA);
  assert.strictEqual(walletAfterCommit.dailyFree, 0);
  assert.strictEqual(walletAfterCommit.perpetualCredits, baseCredits - 2);
  assert.strictEqual(walletAfterCommit.frozenCredits, 0);
  console.log(`   ✓ Phase 2A: 任务生成成功确认结算，正式核销扣除！剩余总可用: ${walletAfterCommit.totalAvailable}`);

  console.log(`\n7. 测试高并发防透支穿透压力测试 (Concurrency Defense)...`);
  // 创建一个仅有 5 积分的隔离用户
  const userC = await reserveTestUserId(query);
  await execute(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt, role, credits, status, created_at)
    VALUES ($1, $2, '并发测试用户C', 'fake', 'fake', 'user', 0, 'active', $3)
  `, [userC, `${userC}@test.com`, now]);
  await grantPerpetualCredits(userC, 5, '并发测试初始额度');

  // 启动 10 个并行请求，每个都尝试预扣 5 积分
  const parallelTasks = Array.from({ length: 10 }).map((_, i) => {
    return reserveCredits({
      userId: userC,
      amount: 5,
      modelId: 'test-model',
      idempotencyKey: `idem_concurrent_${i}_${randomId()}`,
    }).then(r => ({ success: true, r })).catch(e => ({ success: false, error: e.message }));
  });

  const parallelResults = await Promise.all(parallelTasks);
  const successes = parallelResults.filter(r => r.success);
  const failures = parallelResults.filter(r => !r.success);

  console.log(`   ✓ 10 个并发扣减 5 积分请求：成功 ${successes.length} 个，拦截阻断 ${failures.length} 个`);
  assert.strictEqual(successes.length, 1, '只有 1 个请求能成功预扣');
  assert.strictEqual(failures.length, 9, '其余 9 个必须被锁与余额校验阻断');

  const walletCAfter = await getCreditWallet(userC);
  assert.strictEqual(walletCAfter.perpetualCredits, 0);
  assert.strictEqual(walletCAfter.frozenCredits, 5);
  console.log(`   ✓ 并发防穿透验证完全通过，账户未发生任何超额透支！`);

  console.log(`\n8. 测试全局复式记账与借贷平账校验 (Reconciliation Engine)...`);
  const recon = await runDailyReconciliation();
  console.log(`   借方总计: ${recon.currencyTotals.totalDebit}, 贷方总计: ${recon.currencyTotals.totalCredit}, 差额: ${recon.currencyTotals.difference}`);
  console.log(`   借贷严格平衡: ${recon.currencyTotals.isDoubleEntryBalanced}`);
  assert.ok(recon.currencyTotals.isDoubleEntryBalanced, '复式记账全局借贷必须严格相等！');
  console.log(`   ✓ 财务对账核算 100% 平账通过！`);

  console.log(`\n=== [全部 8 项金融级核心测试 100% 通过！] ===\n`);
  process.exit(0);
}

main().catch(err => {
  console.error('测试失败:', err);
  process.exit(1);
});
