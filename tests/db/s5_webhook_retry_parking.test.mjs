import test from 'node:test';
import assert from 'node:assert/strict';

const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
if (testUrl && process.env.DATABASE_URL && testUrl === process.env.DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must not be the same as DATABASE_URL.');
}
if (testUrl) process.env.DATABASE_URL = testUrl;

// 重试窗口在模块加载时被读死，否则一次用例的结论会跟着开发机的环境变量漂。
process.env.WEBHOOK_RETRY_STALE_MS = '60000';
// 密钥包裹口令也必须定死：否则"存进去再读出来"会因为 .env.local 的漂移而随机红。
process.env.PROVIDER_SECRETS_ENCRYPTION_KEY = 'integration-test-wrapping-key';

const db = await import('../../lib/db/index.js');
const migrations = await import('../../lib/db/migrations.js');
const webhookRepo = await import('../../lib/repositories/webhooks.js');
const { retryDueWebhookEvents } = await import('../../lib/services/webhookDispatcher.js');

if (testUrl) await migrations.runMigrations();

const MAX_ATTEMPTS = 4;
const STALE_MS = 60000;
const stamp = Date.now().toString(36);

// 一个必然在写台账之前抛出的事件：用户不存在，履约无从谈起。
function failingEvent(eventId) {
  return {
    id: eventId,
    type: 'checkout.session.completed',
    data: {
      object: {
        id: eventId,
        payment_status: 'paid',
        metadata: { user_id: `absent_user_${stamp}`, order_id: `absent_order_${stamp}` },
      },
    },
  };
}

async function seed({ eventId, status, attempts, nextRetryAt, lastAttemptAt = null, payload }) {
  await db.execute(`
    INSERT INTO webhook_events
      (provider, event_id, event_type, status, attempts, payload_json, created_at, last_attempt_at, next_retry_at)
    VALUES ('stripe', $1, 'checkout.session.completed', $2, $3, $4::jsonb, now(), $5, $6)
  `, [eventId, status, attempts, JSON.stringify(payload), lastAttemptAt, nextRetryAt]);
}

async function readRow(eventId) {
  return db.queryOne('SELECT status, attempts, next_retry_at, last_error FROM webhook_events WHERE provider = $1 AND event_id = $2', ['stripe', eventId]);
}

function at(offsetMs) {
  return new Date(Date.now() + offsetMs);
}

test('a due webhook retry consumes an attempt and parks once the budget is spent', { skip: !testUrl }, async () => {
  const eventId = `wh_throw_${stamp}`;
  await seed({ eventId, status: 'failed', attempts: 1, nextRetryAt: at(-1000), payload: failingEvent(eventId) });

  let row = await readRow(eventId);
  for (let round = 0; row.attempts < MAX_ATTEMPTS; round += 1) {
    // 每轮都把"现在"推到退避终点之后，用时间推进代替真实等待。
    const now = Date.now() + round * 10 * 60 * 60 * 1000;
    const result = await retryDueWebhookEvents({ limit: 10, now, maxAttempts: MAX_ATTEMPTS });
    const mine = result.results.find((entry) => entry.eventId === eventId);
    assert.ok(mine, '到期事件必须被 worker 扫到');
    assert.equal(mine.ok, false);
    assert.equal(mine.code, 'PAYMENT_USER_NOT_FOUND');
    row = await readRow(eventId);
    assert.equal(row.attempts, round + 2, `第 ${round + 1} 次重放后要留下尝试记录`);
    assert.equal(row.status, 'failed');
    assert.ok(row.next_retry_at, '仍待重试的事件必须排好下一次时间');
  }

  const parked = await readRow(eventId);
  const idle = await retryDueWebhookEvents({ limit: 10, now: Date.now() + 10 * 365 * 24 * 3600 * 1000, maxAttempts: MAX_ATTEMPTS });
  assert.ok(!idle.results.some((entry) => entry.eventId === eventId), '尝试次数耗尽后不能再被重放');
  assert.deepEqual(await readRow(eventId), parked, '停放后行必须保持不变');
});

test('a replay row that cannot even be dispatched is parked instead of retried forever', { skip: !testUrl }, async () => {
  const eventId = `wh_badpayload_${stamp}`;
  // payload 连可去重的 id 都没有：重放永远不会成功，停在 retrying 就是无限循环。
  await seed({ eventId, status: 'failed', attempts: 1, nextRetryAt: at(-1000), payload: { type: 'checkout.session.completed' } });

  const result = await retryDueWebhookEvents({ limit: 10, maxAttempts: MAX_ATTEMPTS });
  const mine = result.results.find((entry) => entry.eventId === eventId);
  assert.ok(mine, '坏报文事件也会先被占位');
  assert.equal(mine.code, 'WEBHOOK_PAYLOAD_INVALID');

  const row = await readRow(eventId);
  assert.notEqual(row.status, 'retrying', '占位后没能推进的行不能留在 retrying，否则每 stale 窗口就被重投一次');
  assert.equal(row.status, 'failed');
  assert.equal(row.attempts, 2);
  assert.ok(row.next_retry_at, '坏报文也要按退避节奏停放，最终同样受最大尝试次数约束');
});

test('only one worker claims a due event and a stale claim is reclaimable', { skip: !testUrl }, async () => {
  const eventId = `wh_claim_${stamp}`;
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  const staleBefore = new Date(now - STALE_MS).toISOString();
  await seed({ eventId, status: 'failed', attempts: 1, nextRetryAt: at(-1000), payload: failingEvent(eventId) });

  const due = await webhookRepo.listDueWebhookRetries({ limit: 10, timestamp, staleBefore, maxAttempts: MAX_ATTEMPTS });
  assert.ok(due.some((row) => row.event_id === eventId));

  const winner = await webhookRepo.claimWebhookRetry({ provider: 'stripe', eventId, timestamp, staleBefore, maxAttempts: MAX_ATTEMPTS });
  assert.ok(winner, '第一个 worker 必须占到行');
  assert.equal(winner.status, 'retrying');
  const loser = await webhookRepo.claimWebhookRetry({ provider: 'stripe', eventId, timestamp, staleBefore, maxAttempts: MAX_ATTEMPTS });
  assert.equal(loser, null, '同一时刻的并发占位只能有一个赢家');

  // 持有者崩溃后行会停在 retrying：超过 stale 窗口必须能被别人接走。
  const reclaimed = await webhookRepo.claimWebhookRetry({
    provider: 'stripe',
    eventId,
    timestamp: new Date(now + STALE_MS + 1000).toISOString(),
    staleBefore: new Date(now + STALE_MS + 1000 - STALE_MS).toISOString(),
    maxAttempts: MAX_ATTEMPTS,
  });
  assert.ok(reclaimed, '陈旧的重试占位必须可回收');
});

test('a forced replay of an already received event is recorded as another attempt', { skip: !testUrl }, async () => {
  const eventId = `wh_manual_${stamp}`;
  await seed({ eventId, status: 'processed', attempts: 3, nextRetryAt: null, payload: failingEvent(eventId) });

  const { replayWebhookEvent } = await import('../../lib/services/webhookDispatcher.js');
  const result = await replayWebhookEvent({ actor: { id: 'integration:test' }, eventId, requestId: 'req_manual', provider: 'stripe' });
  assert.equal(result.status, 'replay_failed');
  assert.match(result.error, /PAYMENT_USER_NOT_FOUND/);

  const row = await readRow(eventId);
  assert.equal(row.status, 'replay_failed');
  assert.equal(row.attempts, 4, '重放失败也要算一次尝试：事务回滚会吞掉自增，停放时必须补记');
  assert.ok(row.last_error);
  // 人工重放同样按次累计，不能因为"是管理员点的"就绕过预算记账。
  await replayWebhookEvent({ actor: { id: 'integration:test' }, eventId, requestId: 'req_manual_2', provider: 'stripe' });
  assert.equal((await readRow(eventId)).attempts, 5);
});

test('provider secrets distinguish an absent row from a store that cannot be read', { skip: !testUrl }, async () => {
  const { saveProviderSecret, readProviderSecret, getProviderSecret } = await import('../../lib/repositories/providers.js');
  const provider = `p6_secret_${stamp}`;

  assert.deepEqual(await readProviderSecret(provider, 'private_key'), { status: 'absent', value: null });
  assert.equal(await getProviderSecret(provider, 'private_key'), null);

  await saveProviderSecret({ provider, name: 'private_key', secretValue: 'inline-secret' });
  const read = await readProviderSecret(provider, 'private_key');
  assert.equal(read.status, 'ok');
  assert.equal(read.value, 'inline-secret');

  // 密文被改写（密钥轮换漏版本、库内数据损坏）必须是 error，不能退回"商户没配"。
  await db.execute('UPDATE provider_secrets SET auth_tag = $1 WHERE provider = $2 AND name = $3', ['ffffffff', provider, 'private_key']);
  const broken = await readProviderSecret(provider, 'private_key');
  assert.equal(broken.status, 'error');
  assert.equal(broken.value, null);
  await db.execute('DELETE FROM provider_secrets WHERE provider = $1', [provider]);
});
