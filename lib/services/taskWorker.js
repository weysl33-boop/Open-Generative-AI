import { cleanupExpiredReservations } from '../financial/creditService.js';
import { listPollableGenerationIds, listQueuedGenerationIds } from '../repositories/creations.js';
import { expireStaleGenerationTasks, processGenerationTask, resumeGenerationTask } from './generationCore.js';
import { cycleDue, reconcilePendingPaymentOrders, RECONCILE_INTERVALS } from './paymentReconciliation.js';
import { retryDueWebhookEvents } from './webhookDispatcher.js';

let lastWebhookRetryAt = 0;
let lastPaymentSyncAt = 0;

async function runSafely(failureCode, run) {
  try {
    return await run();
  } catch (error) {
    // 对账轮次的异常不能带走生成队列的心跳。
    return { error: String(error.code || failureCode).slice(0, 120) };
  }
}

// Compatibility entry point for existing worker invocations. The lifecycle
// service owns provider calls, settlement, release, and terminal state changes.
export async function executePendingCreation(creationId) {
  return processGenerationTask({ creationId });
}

async function runBatch(ids, run) {
  const out = [];
  for (const row of ids) {
    try {
      out.push({ id: row.id, result: await run(row.id) });
    } catch (error) {
      // 单个任务的异常不能带走整个心跳：其余任务还要被推进。
      out.push({ id: row.id, error: error.code || 'TASK_PROCESSING_FAILED' });
    }
  }
  return out;
}

export async function runGenerationWorkerOnce({ batchSize = 10, pollBatchSize = 20, now = Date.now() } = {}) {
  const size = Math.min(50, Math.max(1, Number(batchSize) || 10));
  const pollSize = Math.min(50, Math.max(1, Number(pollBatchSize) || 20));

  // 先轮询已提交的任务再领新工作：渠道并发闸门数的是在途尝试数，
  // 先把拿到结果的尝试关掉，新任务才有位置，否则高峰期会集体排队空转。
  const pollDue = await listPollableGenerationIds(pollSize);
  const polled = await runBatch(pollDue, (id) => resumeGenerationTask({ creationId: id }));

  // Claiming is intentionally performed by processGenerationTask with an
  // atomic queued -> processing update. This query only discovers durable
  // work; concurrent workers are safe because losers become idempotent no-ops.
  const queued = await listQueuedGenerationIds(size);
  const processed = await runBatch(queued, (id) => processGenerationTask({ creationId: id }));

  const [expiredReservations, staleTasks] = await Promise.all([
    cleanupExpiredReservations(),
    expireStaleGenerationTasks(),
  ]);

  // 支付对账挂在同一颗心跳上：厂商通知的重推窗口只有几小时，等人工发现时事件早就过期了。
  let payment = null;
  if (cycleDue({ lastRunAt: lastWebhookRetryAt, intervalMs: RECONCILE_INTERVALS.webhookRetryMs, now })) {
    lastWebhookRetryAt = now;
    payment = { webhooks: await runSafely('WEBHOOK_RETRY_CYCLE_FAILED', () => retryDueWebhookEvents({ now })) };
  }
  if (cycleDue({ lastRunAt: lastPaymentSyncAt, intervalMs: RECONCILE_INTERVALS.paymentSyncMs, now })) {
    lastPaymentSyncAt = now;
    payment = { ...(payment || {}), orders: await runSafely('PAYMENT_SYNC_CYCLE_FAILED', () => reconcilePendingPaymentOrders({ now })) };
  }

  return {
    queuedCount: queued.length,
    pollDueCount: pollDue.length,
    polled,
    processed,
    expiredReservations,
    staleTasks,
    payment,
  };
}

export { expireStaleGenerationTasks };
