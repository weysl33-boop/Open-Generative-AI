import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const { reserveTestUserId } = await import('../../scripts/test-user-id-fixtures.mjs');
const financial = await import('../../lib/financial/index.js');
const { submitFeedback, reviewFeedback, listMyFeedback, listFeedbackForAdmin } = await import('../../lib/services/feedback.js');
const { findFeedbackKind } = await import('../../lib/feedback/catalog.js');

if (testUrl) await migrations.runMigrations();

const suffix = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
let actorId = null;
let actor = null;

async function makeActor() {
  // reviewer_id 有指向 users(id) 的外键：裁决人必须是真实用户，否则结清事务直接失败。
  if (!actorId) {
    actorId = await reserveTestUserId((sql, params) => db.query(sql, params));
    actor = { id: actorId, email: `admin_${suffix}@example.test` };
  }
  await db.execute(
    `INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
     VALUES ($1, $2, 'hash', 'salt', 'admin', 0, 'active')
     ON CONFLICT (id) DO NOTHING`,
    [actorId, actor.email]
  );
}

test.after(async () => {
  if (testUrl && actorId) await db.execute('DELETE FROM users WHERE id = $1', [actorId]).catch(() => {});
  await db.closePgPool();
});

async function makeUser(tag) {
  const id = await reserveTestUserId((sql, params) => db.query(sql, params));
  await db.execute(
    `INSERT INTO users (id, email, password_hash, password_salt, role, credits, status)
     VALUES ($1, $2, 'hash', 'salt', 'user', 0, 'active')`,
    [id, `${id}@example.test`]
  );
  return id;
}

async function dropUser(userId) {
  await db.execute('DELETE FROM feedback_reports WHERE user_id = $1', [userId]).catch(() => {});
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

async function rowOf(feedbackId) {
  return db.queryOne('SELECT * FROM feedback_reports WHERE id = $1', [feedbackId]);
}

const detail = '把地址栏里的作品 id 换成别人的编号，就能读到未脱敏的消耗明细，复现步骤见附图。';

test('提交本身不发币：只有人工采纳才铸币，且一笔建议只能结清一次', { skip: !testUrl }, async () => {
  const userId = await makeUser('reporter');
  try {
    await makeActor();
    assert.equal((await submitFeedback({ userId, kind: 'spam', title: '一个目录里没有的类型', detail })).error, '提交类型无效，请重新选择');
    assert.equal((await submitFeedback({ userId, kind: 'bug_report', title: '太短', detail })).error, '请填写不少于 5 个字的标题，方便定位问题');
    assert.equal((await submitFeedback({ userId, kind: 'bug_report', title: '描述太短的提交', detail: '一句话' })).error, '描述不少于 20 个字，请写清复现步骤或改进理由');
    assert.equal(Number((await db.queryOne('SELECT count(*) AS count FROM feedback_reports WHERE user_id = $1', [userId])).count), 0, '校验失败的提交不能占用审核队列');

    const submitted = await submitFeedback({ userId, kind: 'security', title: '越权可以读到别人的消耗明细', detail });
    assert.ok(submitted.feedbackId);

    const pending = await rowOf(submitted.feedbackId);
    assert.equal(pending.status, 'pending');
    assert.equal(Number(pending.reward_coins), 0);
    assert.equal(await coinBalance(userId), 0, '提交动作本身不能铸币，否则刷一条就白拿奖励');

    const rejected = await reviewFeedback({ actor, feedbackId: submitted.feedbackId, resolution: 'rejected', note: '已定位并修复' });
    assert.equal(rejected.error, undefined);
    assert.equal(rejected.feedback.status, 'rejected');
    assert.equal(await coinBalance(userId), 0, '未采纳的提交不发币');

    const reopened = await reviewFeedback({ actor, feedbackId: submitted.feedbackId, resolution: 'accepted', rewardCoins: 500 });
    assert.equal(reopened.error, '该提交已审核，不能重复裁决');
    assert.equal(await coinBalance(userId), 0, '被拒绝的二次裁决不能铸币');
    assert.equal(Number((await rowOf(submitted.feedbackId)).reward_coins), 0);
  } finally {
    await dropUser(userId);
  }
});

test('采纳发放：默认数量来自类型目录，结清回写流水并留下审计', { skip: !testUrl }, async () => {
  const userId = await makeUser('winner');
  try {
    await makeActor();
    const accepted = await submitFeedback({ userId, kind: 'improvement', title: '希望权益页显示硬币明细的筛选', detail });
    const reviewed = await reviewFeedback({ actor, feedbackId: accepted.feedbackId, resolution: 'accepted' });
    const fallback = findFeedbackKind('improvement').rewardDefault;
    assert.equal(reviewed.rewardedCoins, fallback, '不填数量时按类型默认值发放');
    assert.equal(await coinBalance(userId), fallback);

    const settled = await rowOf(accepted.feedbackId);
    assert.equal(settled.status, 'accepted');
    assert.equal(Number(settled.reward_coins), fallback);
    assert.ok(settled.reward_transaction_id, '结清必须回写发放流水，否则无法与账本对账');
    assert.equal(settled.reviewer_id, actor.id);

    await financial.grantFeedbackRewardCoins({ userId, feedbackId: accepted.feedbackId, amount: 999 });
    assert.equal(await coinBalance(userId), fallback, '幂等键锁死为 feedback:<id>:reward，重复发放不二次铸币');

    const audit = await db.queryOne(
      `SELECT action, actor_id, after_json FROM admin_audit_logs
       WHERE target_type = 'feedback_report' AND target_id = $1`,
      [accepted.feedbackId]
    );
    assert.equal(audit?.action, 'feedback.review', '后台裁决必须留痕');

    const custom = await submitFeedback({ userId, kind: 'security', title: '越权读取他人账单详情的另一条路径', detail });
    const pendingBefore = await listFeedbackForAdmin(new URLSearchParams({ status: 'pending' }));
    assert.ok(
      pendingBefore.rows.some((item) => item.id === custom.feedbackId),
      '新提交必须立刻出现在待审队列，否则人工审核无从下手'
    );

    const customReviewed = await reviewFeedback({ actor, feedbackId: custom.feedbackId, resolution: 'accepted', rewardCoins: 12, note: '已热修' });
    assert.equal(customReviewed.rewardedCoins, 12, '管理员裁定的数量优先于目录默认值');
    assert.equal(await coinBalance(userId), fallback + 12);

    const mine = await listMyFeedback(userId);
    assert.equal(mine.length, 2);
    assert.equal(mine.find((item) => item.id === accepted.feedbackId).rewardCoins, fallback);
    assert.equal(mine.find((item) => item.id === accepted.feedbackId).reviewNote, null);
    assert.equal(mine.find((item) => item.id === custom.feedbackId).reviewNote, '已热修');

    const acceptedPage = await listFeedbackForAdmin(new URLSearchParams({ status: 'accepted', kind: 'improvement' }));
    const listed = acceptedPage.rows.find((item) => item.id === accepted.feedbackId);
    assert.ok(listed, '后台列表必须能按状态与类型筛出同一批行');
    assert.equal(listed.user_id, userId);
    assert.equal(listed.email, `${userId}@example.test`, '后台行要带上提交人邮箱，否则管理员无从联系');
    assert.equal(Number(listed.reward_coins), fallback);
    const pendingAfter = await listFeedbackForAdmin(new URLSearchParams({ status: 'pending' }));
    assert.ok(!pendingAfter.rows.some((item) => item.user_id === userId), '已裁决的提交不再占用待审队列');
  } finally {
    await dropUser(userId);
  }
});

test('审核结论非法或记录不存在时直接返回业务错误，不碰账本', { skip: !testUrl }, async () => {
  const userId = await makeUser('quiet');
  try {
    const submitted = await submitFeedback({ userId, kind: 'bug_report', title: '导出按钮点了没有反应', detail });
    assert.equal((await reviewFeedback({ actor, feedbackId: submitted.feedbackId, resolution: 'maybe' })).error, '审核结论无效');
    assert.equal((await reviewFeedback({ actor, feedbackId: `fb_missing_${suffix}`, resolution: 'accepted' })).error, '提交记录不存在');
    assert.equal((await rowOf(submitted.feedbackId)).status, 'pending');
    assert.equal(await coinBalance(userId), 0);
  } finally {
    await dropUser(userId);
  }
});
