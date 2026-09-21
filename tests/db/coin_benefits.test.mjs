import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const financial = await import('../../lib/financial/index.js');
const { CURRENCY, ACCOUNT_CODES } = financial;
const { BENEFITS } = await import('../../lib/benefits/catalog.js');
const { listQueuedGenerationIds } = await import('../../lib/repositories/creations.js');

if (testUrl) await migrations.runMigrations();

const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

test.after(async () => {
  await db.closePgPool();
});

async function makeUser(tag) {
  const id = `coin_ben_${tag}_${suffix}`;
  await db.execute(
    `INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
     VALUES ($1, $2, 'hash', 'salt', 'user', 0, 'active')`,
    [id, `${id}@example.test`]
  );
  return id;
}

async function dropUser(userId) {
  await db.execute('DELETE FROM ai_studio.creations WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM credit_ledger_v2 WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM credit_wallets WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute(`
    DELETE FROM currency_journal_entries
    WHERE user_id = $1
       OR transaction_id IN (SELECT transaction_id FROM currency_journal_entries WHERE user_id = $1)
  `, [userId]).catch(() => {});
  await db.execute('DELETE FROM currency_wallets WHERE user_id = $1', [userId]).catch(() => {});
  await db.execute('DELETE FROM users WHERE id = $1', [userId]).catch(() => {});
}

async function coinBalance(userId) {
  const row = await db.queryOne('SELECT available_balance FROM currency_wallets WHERE user_id = $1', [userId]);
  return Number(row?.available_balance ?? 0);
}

async function perpetualCredits(userId) {
  const row = await db.queryOne('SELECT perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId]);
  return Number(row?.perpetual_credits ?? 0);
}

async function profileOf(userId) {
  return db.queryOne('SELECT avatar_frame, avatar_frames, priority_until FROM users WHERE id = $1', [userId]);
}

async function fundCoins(userId, amount, tag) {
  return financial.grantFeedbackRewardCoins({
    userId,
    feedbackId: `fb_${tag}_${suffix}`,
    amount,
    note: '测试发放',
  });
}

async function queuedIds() {
  return (await listQueuedGenerationIds(50)).map((row) => row.id);
}

async function insertQueuedCreation({ id, userId, createdAt }) {
  await db.execute(
    `INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, created_at, updated_at)
     VALUES ($1, $2, 'coin_benefits_test', '队列测试', 'queued', 0, $3, $3)`,
    [id, userId, createdAt]
  );
}

test('硬币只从两条通道进来：每日登录当天一次，加审核采纳后的建议奖励', { skip: !testUrl }, async () => {
  const userId = await makeUser('earn');
  try {
    const first = await financial.claimDailyLoginCoin(userId);
    assert.equal(first.isFirstToday, true);
    assert.equal(first.amount, CURRENCY.DAILY_LOGIN_REWARD);

    const again = await financial.claimDailyLoginCoin(userId);
    assert.equal(again.isFirstToday, false);
    assert.equal(again.amount, 0);
    assert.equal(await coinBalance(userId), CURRENCY.DAILY_LOGIN_REWARD, '同一天重复打卡不能再生币');

    await fundCoins(userId, 10, 'earn');
    assert.equal(await coinBalance(userId), CURRENCY.DAILY_LOGIN_REWARD + 10, '建议奖励必须真的铸进钱包');

    await fundCoins(userId, 10, 'earn');
    assert.equal(await coinBalance(userId), CURRENCY.DAILY_LOGIN_REWARD + 10, '同一笔建议重复发放必须命中幂等键');
  } finally {
    await dropUser(userId);
  }
});

test('硬币不再兑换算力：历史项目下架，兑换权益不会让算力账户产生任何变动', { skip: !testUrl }, async () => {
  const userId = await makeUser('takedown');
  try {
    assert.equal(financial.exchangeCoinToCredits, undefined, '硬币换算力的服务入口必须已删除');
    assert.ok(BENEFITS.every((benefit) => benefit.kind !== 'credits'), '权益目录里不能再有算力类项目');

    await fundCoins(userId, 30, 'takedown');

    for (const benefitId of ['credits_5', 'credits_20']) {
      await assert.rejects(
        () => financial.redeemBenefit({ userId, benefitId, idempotencyKey: `benefit:${benefitId}:${suffix}` }),
        /已下架/,
        '下架的算力项目必须被拒绝，而不是按新价格继续售卖'
      );
    }
    assert.equal(await perpetualCredits(userId), 0, '被拒绝的兑换不能到账算力');

    const redeemed = await financial.redeemBenefit({
      userId,
      benefitId: 'boost_24h',
      idempotencyKey: `benefit:takedown:${suffix}`,
    });
    assert.equal(redeemed.result.balanceAfter, 27);
    assert.equal(await coinBalance(userId), 27);
    assert.equal(await perpetualCredits(userId), 0, '权益兑换只消耗硬币，不产生算力');
    assert.equal(
      await db.queryOne('SELECT user_id FROM credit_wallets WHERE user_id = $1', [userId]),
      null,
      '权益兑换不得为用户新建算力钱包'
    );

    const ledger = await financial.getCurrencyLedger(userId, { limit: 50 });
    assert.equal(ledger.filter((entry) => entry.bizType === 'EXCHANGE_CREDITS').length, 0);
    assert.equal(ledger.filter((entry) => entry.bizType === 'BENEFIT_REDEEM').length, 1, '一笔兑换在用户明细里只能出现一次');

    const revenue = await db.queryOne(
      `SELECT direction, amount FROM currency_journal_entries
       WHERE transaction_id = $1 AND account_code = $2`,
      [redeemed.result.transactionId, ACCOUNT_CODES.REVENUE_FULFILLMENT]
    );
    assert.deepEqual(
      { direction: revenue.direction, amount: Number(revenue.amount) },
      { direction: 'CREDIT', amount: 3 },
      '借 2001 必须配一笔贷 4002，否则平账巡检会报差额'
    );
  } finally {
    await dropUser(userId);
  }
});

test('优先出图加速卡：兑换后该用户任务先出队，未到期重复兑换按时长顺延', { skip: !testUrl }, async () => {
  const normalUser = await makeUser('normal');
  const boostedUser = await makeUser('boosted');
  const normalCreation = `creation_normal_${suffix}`;
  const boostedCreation = `creation_boosted_${suffix}`;
  try {
    const earlier = new Date(Date.now() - 120000).toISOString();
    const later = new Date(Date.now() - 60000).toISOString();
    await insertQueuedCreation({ id: normalCreation, userId: normalUser, createdAt: earlier });
    await insertQueuedCreation({ id: boostedCreation, userId: boostedUser, createdAt: later });
    await fundCoins(boostedUser, 20, 'boost');

    const firstQueue = await queuedIds();
    assert.ok(firstQueue.includes(normalCreation) && firstQueue.includes(boostedCreation), '两条待处理任务必须都在出站队列里');
    assert.ok(
      firstQueue.indexOf(normalCreation) < firstQueue.indexOf(boostedCreation),
      '没有加速卡时严格按提交顺序出队'
    );

    const redeemed = await financial.redeemBenefit({
      userId: boostedUser,
      benefitId: 'boost_24h',
      idempotencyKey: `benefit:boost_24h:${suffix}:1`,
    });
    assert.equal(redeemed.result.hours, 24);
    assert.equal(await coinBalance(boostedUser), 17);
    assert.ok(new Date(redeemed.result.priorityUntil).getTime() > Date.now() + 23 * 3600000, '有效期必须覆盖 24 小时');

    const boostedQueue = await queuedIds();
    assert.ok(
      boostedQueue.indexOf(boostedCreation) < boostedQueue.indexOf(normalCreation),
      '加速卡有效期内必须排在普通任务之前，否则兑换没有真实效果'
    );

    const renewed = await financial.redeemBenefit({
      userId: boostedUser,
      benefitId: 'boost_24h',
      idempotencyKey: `benefit:boost_24h:${suffix}:2`,
    });
    assert.ok(
      new Date(renewed.result.priorityUntil) > new Date(redeemed.result.priorityUntil),
      '未到期再兑换要在剩余时长上顺延，不能重置回 24 小时'
    );
    assert.equal(await coinBalance(boostedUser), 14);

    await db.execute("UPDATE users SET priority_until = now() - INTERVAL '1 hour' WHERE id = $1", [boostedUser]);
    const expiredQueue = await queuedIds();
    assert.ok(
      expiredQueue.indexOf(normalCreation) < expiredQueue.indexOf(boostedCreation),
      '加速卡过期后必须退回普通队列位置，不能永久插队'
    );
  } finally {
    await dropUser(boostedUser);
    await dropUser(normalUser);
  }
});

test('头像框：一次兑换永久拥有并直接佩戴，重复兑换与未拥有佩戴都被拒绝', { skip: !testUrl }, async () => {
  const userId = await makeUser('frame');
  try {
    await fundCoins(userId, 40, 'frame');
    const redeemed = await financial.redeemBenefit({
      userId,
      benefitId: 'frame_coin_gold',
      idempotencyKey: `benefit:frame_coin_gold:${suffix}`,
    });
    assert.equal(redeemed.result.frame, 'coin-gold');
    assert.equal(await coinBalance(userId), 10);

    let profile = await profileOf(userId);
    assert.deepEqual(profile.avatar_frames, ['coin-gold']);
    assert.equal(profile.avatar_frame, 'coin-gold', '兑换完成后直接佩戴，不需要用户二次操作');

    await assert.rejects(
      () => financial.redeemBenefit({ userId, benefitId: 'frame_coin_gold', idempotencyKey: `benefit:dup:${suffix}` }),
      /已拥有/,
      '永久权益不能重复售卖'
    );
    assert.equal(await coinBalance(userId), 10, '被拒绝的重复兑换不能扣币');
    assert.equal((await profileOf(userId)).avatar_frames.length, 1);

    await assert.rejects(
      () => financial.wearAvatarFrame({ userId, frame: 'coin-cyan' }),
      /尚未拥有/,
      '未拥有的头像框不能凭空佩戴'
    );

    const removed = await financial.wearAvatarFrame({ userId, frame: null });
    assert.equal(removed.avatarFrame, null);
    profile = await profileOf(userId);
    assert.equal(profile.avatar_frame, null);
    assert.deepEqual(profile.avatar_frames, ['coin-gold'], '摘下只换下佩戴位，不清空拥有列表');
    assert.equal((await financial.wearAvatarFrame({ userId, frame: 'coin-gold' })).avatarFrame, 'coin-gold');

    await assert.rejects(
      () => financial.redeemBenefit({ userId, benefitId: 'frame_coin_cyan', idempotencyKey: `benefit:cyan:${suffix}` }),
      /余额不足/,
      '余额不足必须整体失败，不能先记流水再扣成负数'
    );
    assert.equal(await coinBalance(userId), 10);
    profile = await profileOf(userId);
    assert.deepEqual(profile.avatar_frames, ['coin-gold'], '失败的兑换不能留下部分权益');
    assert.equal(profile.avatar_frame, 'coin-gold');
  } finally {
    await dropUser(userId);
  }
});
