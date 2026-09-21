const databaseUrl = String(process.env.DATABASE_URL || '').trim();
if (!databaseUrl) throw new Error('DATABASE_URL is required for the worker cycle test.');
if (!['postgres:', 'postgresql:'].includes(new URL(databaseUrl).protocol)) {
  throw new Error('DATABASE_URL must use the postgres:// or postgresql:// scheme.');
}
const { assertSandboxDatabase } = await import('./require-sandbox-db.mjs');
const { runGenerationWorkerOnce } = await import('../lib/services/taskWorker.js');

// One cycle drains real queued generations, so the target must be a sandbox.
await assertSandboxDatabase();
const res = await runGenerationWorkerOnce();
console.log('WORKER_CYCLE_SUCCESS:', JSON.stringify(res));
