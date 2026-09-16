import assert from 'node:assert';
import {
  rechargeCurrency,
  getCurrencyWallet,
  setPayPassword,
  transferCurrency,
  getCreditWallet,
  dailyCheckIn,
  reserveCredits,
  commitCredits,
  voidCredits,
  exchangeCoinToCredits,
  runDailyReconciliation,
  grantPerpetualCredits
} from '../lib/financial/index.js';
import { query, queryOne, execute, nowIso, randomId } from '../lib/db/index.js';

console.log('=== [开始金融级系统核心测试套件] ===');

async function main() {
  const now = nowIso();
  const userA = `usr_test_a_${Date.now()}`;
  const userB = `usr_test_b_${Date.now()}`;

  // 创建两个测试用户
  await execute(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt, role, credits, status, created_at)
    VALUES (?, ?, '测试用户A', 'fakehash', 'fakesalt', 'user', 0, 'active', ?),
           (?, ?, '测试用户B', 'fakehash', 'fakesalt', 'user', 0, 'active', ?)
  `, [userA, `${userA}@test.com`, now, userB, `${userB}@test.com`, now]);

  console.log(`\n1. 测试平台货币充值 (法币购买 K-Coin) 与复式分录...`);
  const rechargeRes = await rechargeCurrency({
    userId: userA,
    amountCny: 50, // 50元 = 500 K币
    channel: 'alipay',
    providerOrderId: `ali_${Date.now()}`,
    idempotencyKey: `idem_rec_${randomId()}`,
  });
  assert.strictEqual(rechargeRes.coinAmount, 500);

  const walletA = await getCurrencyWallet(userA);
  assert.strictEqual(walletA.availableBalance, 500);
  console.log(`   ✓ 充值 50 元成功，K 币到账: ${walletA.availableBalance} 币`);

  console.log(`\n2. 测试安全支付密码与转账风控...`);
  // 未设密码转账拦截
  let errorCaught = false;
  try {
    await transferCurrency({
      senderId: userA,
      receiverId: userB,
      amount: 100,
      payPassword: 'wrongpassword',
    });
  } catch (e) {
    errorCaught = true;
    console.log(`   ✓ 未设密码转账拦截正确: ${e.message}`);
  }
  assert.ok(errorCaught);

  // 设置安全支付密码
  await setPayPassword(userA, '123456');
  console.log(`   ✓ 成功为用户 A 设置 6 位支付密码`);

  // 正常转账 100 币给 B (手续费 1% = 1 币，A 扣 101 币，B 到 100 币)
  const transferRes = await transferCurrency({
    senderId: userA,
    receiverId: userB,
    amount: 100,
    payPassword: '123456',
    idempotencyKey: `idem_tf_${randomId()}`,
  });
  assert.strictEqual(transferRes.amount, 100);
  assert.strictEqual(transferRes.fee, 1);

  const walletAAfterTf = await getCurrencyWallet(userA);
  const walletBAfterTf = await getCurrencyWallet(userB);
  assert.strictEqual(walletAAfterTf.availableBalance, 399);
  assert.strictEqual(walletBAfterTf.availableBalance, 100);
  console.log(`   ✓ 转账成功！用户 A 余额: ${walletAAfterTf.availableBalance} 币 (扣除 100 + 1手续费)，用户 B 余额: ${walletBAfterTf.availableBalance} 币`);

  console.log(`\n3. 测试通用货币 K 币兑换 AI 算力积分...`);
  // 用户 A 使用 50 K 币兑换 500 永久算力点 (1:10)
  const exchangeRes = await exchangeCoinToCredits({
    userId: userA,
    coinAmount: 50,
    idempotencyKey: `idem_ex_${randomId()}`,
  });
  assert.strictEqual(exchangeRes.spentCoins, 50);
  assert.strictEqual(exchangeRes.creditsGained, 500);

  const walletAAfterEx = await getCurrencyWallet(userA);
  const creditsAAfterEx = await getCreditWallet(userA);
  assert.strictEqual(walletAAfterEx.availableBalance, 349);
  assert.strictEqual(creditsAAfterEx.perpetualCredits, 500);
  console.log(`   ✓ 兑换成功！消耗 50 K币，获得 500 永久算力点，当前算力总可用: ${creditsAAfterEx.totalAvailable}`);

  console.log(`\n4. 测试每日签到与多桶 FIFO 优先级扣除...`);
  // 每日签到获得 10 每日点数
  const checkinRes = await dailyCheckIn(userA);
  assert.strictEqual(checkinRes.rewardCredits, 10);
  const creditsAAfterCheckin = await getCreditWallet(userA);
  assert.strictEqual(creditsAAfterCheckin.dailyFree, 10);
  assert.strictEqual(creditsAAfterCheckin.perpetualCredits, 500);
  assert.strictEqual(creditsAAfterCheckin.totalAvailable, 510);
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
  assert.strictEqual(walletDuringReserve1.perpetualCredits, 495);
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
  assert.strictEqual(walletAfterVoid.perpetualCredits, 500);
  assert.strictEqual(walletAfterVoid.frozenCredits, 0);
  console.log(`   ✓ Phase 2B: 任务失败原路全额解冻成功！每日积分复原为 10，永久积分复原为 500，冻结归 0`);

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
  assert.strictEqual(walletAfterCommit.perpetualCredits, 498);
  assert.strictEqual(walletAfterCommit.frozenCredits, 0);
  console.log(`   ✓ Phase 2A: 任务生成成功确认结算，正式核销扣除！剩余总可用: ${walletAfterCommit.totalAvailable}`);

  console.log(`\n7. 测试高并发防透支穿透压力测试 (Concurrency Defense)...`);
  // 创建一个仅有 5 积分的隔离用户
  const userC = `usr_test_c_${Date.now()}`;
  await execute(`
    INSERT INTO users (id, email, display_name, password_hash, password_salt, role, credits, status, created_at)
    VALUES (?, ?, '并发测试用户C', 'fake', 'fake', 'user', 0, 'active', ?)
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
