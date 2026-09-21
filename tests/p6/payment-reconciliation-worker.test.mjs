import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { webhookRetryAt, WEBHOOK_RETRY } from '../../lib/services/webhookDispatcher.js';
import { cycleDue, RECONCILE_INTERVALS } from '../../lib/services/paymentReconciliation.js';

test('P6 webhook retries back off instead of hammering the same failure', () => {
  const now = 1_700_000_000_000;
  const delay = (attempts) => new Date(webhookRetryAt({ attempts, now })).getTime() - now;
  assert.equal(delay(1), 60_000);
  assert.equal(delay(2), 120_000);
  assert.equal(delay(3), 240_000);
  assert.equal(delay(4), 480_000);
  // 退避必须有上限：没有上限时一次长时间故障会把下一次重试推到几十年后。
  assert.equal(delay(30), WEBHOOK_RETRY.maxMs);
  assert.equal(new Date(webhookRetryAt({ attempts: 3, now })).getTime(), now + 240_000);
  assert.ok(WEBHOOK_RETRY.maxAttempts >= 5, '至少要给瞬时故障留出足够的重试次数');
});

test('P6 reconciliation throttles each job to its own cadence', () => {
  assert.equal(cycleDue({ lastRunAt: 0, intervalMs: 30_000, now: 1_000 }), true);
  assert.equal(cycleDue({ lastRunAt: 10_000, intervalMs: 30_000, now: 20_000 }), false);
  assert.equal(cycleDue({ lastRunAt: 10_000, intervalMs: 30_000, now: 40_000 }), true);

  // 查单比补投通知稀疏得多：它要真打厂商接口，且新订单可能还在扫码。
  assert.ok(RECONCILE_INTERVALS.paymentSyncMs > RECONCILE_INTERVALS.webhookRetryMs);
  assert.ok(RECONCILE_INTERVALS.paymentGraceMs >= RECONCILE_INTERVALS.paymentSyncMs / 2);
  assert.ok(RECONCILE_INTERVALS.paymentMaxAgeMs > RECONCILE_INTERVALS.paymentGraceMs);
});

test('P6 due events are claimed atomically so two workers cannot replay twice', () => {
  const repo = fs.readFileSync(new URL('../../lib/repositories/webhooks.js', import.meta.url), 'utf8');
  const claim = repo.slice(repo.indexOf('export async function claimWebhookRetry'));

  assert.match(claim, /SET status = 'retrying'/);
  assert.match(claim, /next_retry_at = NULL/);
  // 占位条件必须重复到期判断：并发 worker 只有 UPDATE 真正命中的一方才算抢到。
  assert.match(claim, /status IN \('failed', 'replay_failed'\)/);
  assert.match(claim, /attempts < \$\d/);
  assert.match(claim, /RETURNING/);
  // 崩溃残留的 retrying 行必须能被重新捞回，否则这笔钱永远停在半路。
  assert.match(repo, /status = 'retrying' AND last_attempt_at IS NOT NULL AND last_attempt_at < /);
});

test('P6 the resident worker runs payment reconciliation on its heartbeat', () => {
  const worker = fs.readFileSync(new URL('../../lib/services/taskWorker.js', import.meta.url), 'utf8');
  const entry = fs.readFileSync(new URL('../../scripts/generation-worker.mjs', import.meta.url), 'utf8');

  assert.match(worker, /retryDueWebhookEvents/);
  assert.match(worker, /reconcilePendingPaymentOrders/);
  assert.match(worker, /cycleDue\(/);
  // 对账异常不能带走生成心跳。
  assert.match(worker, /runSafely/);
  assert.match(entry, /webhookRetries/);
  assert.match(entry, /paymentSync/);
});

test('P6 polling and vendor notifications settle on the same event identity', () => {
  const service = fs.readFileSync(new URL('../../lib/services/paymentService.js', import.meta.url), 'utf8');

  // 查单事件必须复用到账通知的 ID 取法，否则同一笔到账会在支付账本里记两条。
  assert.match(service, /id: `wx_\$\{checkResult\.transactionId \|\| order\.id\}`/);
  assert.match(service, /id: `alipay_\$\{checkResult\.transactionId \|\| order\.id\}`/);
  // 金额不能用订单原价兜底：那等于让「厂商没报金额」伪装成「金额一致」。
  assert.match(service, /amount_total: checkResult\.amountTotal,/);
  assert.doesNotMatch(service, /amount_total: checkResult\.amountTotal \|\| order\.amount_minor/);
});
