import { closePgPool } from '../lib/db/index.js';
import { runExportWorkerOnce } from '../lib/services/exports.js';

// Resident service that owns the export queue; see lib/db/write-policy.js.
process.env.KOYOSIM_RUNTIME = 'service';

const intervalMs = Math.max(250, Number(process.env.EXPORT_WORKER_INTERVAL_MS) || 2_000);
const batchSize = Math.min(50, Math.max(1, Number(process.env.EXPORT_WORKER_BATCH_SIZE) || 10));
const once = process.env.EXPORT_WORKER_ONCE === 'true';
let stopping = false;

function requestStop(signal) {
  if (stopping) return;
  stopping = true;
  console.log(`[export-worker] received ${signal}; stopping after current batch`);
}

process.once('SIGINT', () => requestStop('SIGINT'));
process.once('SIGTERM', () => requestStop('SIGTERM'));

try {
  do {
    if (stopping) break;
    const result = await runExportWorkerOnce({ batchSize });
    if (result.queuedCount > 0 || result.purged > 0) console.log('[export-worker]', JSON.stringify(result));
    if (once || stopping) break;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  } while (!stopping);
} finally {
  await closePgPool().catch(() => {});
}
