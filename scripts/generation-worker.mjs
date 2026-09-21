import { closePgPool } from '../lib/db/index.js';
import { runGenerationWorkerOnce } from '../lib/services/taskWorker.js';

// This entry point is a resident service, not a maintenance script: it owns the
// live generation queue, so the production-write guard in lib/db must not treat
// it as an ad-hoc script. See lib/db/write-policy.js.
process.env.KOYOSIM_RUNTIME = 'service';

const pollMs = Math.max(250, Number(process.env.GENERATION_WORKER_POLL_MS) || 1000);
const batchSize = Math.max(1, Number(process.env.GENERATION_WORKER_BATCH_SIZE) || 10);
let stopping = false;
let timer;
let timerResolver;

function requestStop(signal) {
  console.log(`[generation-worker] received ${signal}; stopping after current cycle`);
  stopping = true;
  if (timer) {
    clearTimeout(timer);
    timer = undefined;
    if (timerResolver) {
      timerResolver();
      timerResolver = undefined;
    }
  }
}

process.on('SIGINT', () => requestStop('SIGINT'));
process.on('SIGTERM', () => requestStop('SIGTERM'));

async function sleep(milliseconds) {
  await new Promise((resolve) => {
    timerResolver = resolve;
    timer = setTimeout(() => {
      timerResolver = undefined;
      resolve();
    }, milliseconds);
  });
  timer = undefined;
}

try {
  console.log(`[generation-worker] started; poll=${pollMs}ms batch=${batchSize}`);
  while (!stopping) {
    try {
      const summary = await runGenerationWorkerOnce({ batchSize });
      const payment = summary.payment;
      if (summary.queuedCount || summary.pollDueCount || summary.expiredReservations?.processed?.length || summary.staleTasks?.processed?.length
        || payment?.webhooks?.claimedCount || payment?.orders?.scanned || payment?.webhooks?.error || payment?.orders?.error) {
        console.log('[generation-worker] cycle', JSON.stringify({
          queuedCount: summary.queuedCount,
          processedCount: summary.processed.length,
          pollDueCount: summary.pollDueCount,
          settledCount: summary.polled.filter((r) => r.result?.creation && !r.result.pending).length,
          stillPendingCount: summary.polled.filter((r) => r.result?.pending).length,
          expiredReservations: summary.expiredReservations.processed.length,
          staleTasks: summary.staleTasks.processed.length,
          webhookRetries: payment?.webhooks
            ? { claimed: payment.webhooks.claimedCount, error: payment.webhooks.error || null, results: payment.webhooks.results }
            : undefined,
          paymentSync: payment?.orders ? { scanned: payment.orders.scanned, error: payment.orders.error || null, results: payment.orders.results } : undefined,
        }));
      }
    } catch (error) {
      console.error('[generation-worker] cycle failed', { code: error.code || 'WORKER_ERROR' });
    }
    if (!stopping) await sleep(pollMs);
  }
} finally {
  await closePgPool().catch((error) => console.error('[generation-worker] pool close failed', { code: error.code || 'POOL_CLOSE_FAILED' }));
  console.log('[generation-worker] stopped');
}
