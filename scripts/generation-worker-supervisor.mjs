import { spawn } from 'node:child_process';
import process from 'node:process';

const maxRestarts = Math.max(0, Number(process.env.GENERATION_WORKER_MAX_RESTARTS) || 5);
const restartWindowMs = Math.max(60_000, Number(process.env.GENERATION_WORKER_RESTART_WINDOW_MS) || 10 * 60_000);
const baseBackoffMs = Math.max(250, Number(process.env.GENERATION_WORKER_RESTART_BACKOFF_MS) || 1_000);
const workerArgs = [
  '--experimental-loader',
  './scripts/server-only-loader.mjs',
  'scripts/generation-worker.mjs',
];

let child = null;
let stopping = false;
let restartTimer = null;
const restartTimes = [];

function log(message, details = {}) {
  console.log(`[generation-worker-supervisor] ${message}`, details);
}

function forwardSignal(signal) {
  if (stopping) return;
  stopping = true;
  if (restartTimer) clearTimeout(restartTimer);
  log(`received ${signal}; forwarding to worker`);
  child?.kill(signal);
}

process.on('SIGINT', () => forwardSignal('SIGINT'));
process.on('SIGTERM', () => forwardSignal('SIGTERM'));

function pruneRestartTimes(now) {
  while (restartTimes.length && now - restartTimes[0] > restartWindowMs) restartTimes.shift();
}

function spawnWorker() {
  if (stopping) return;
  child = spawn(process.execPath, workerArgs, {
    stdio: 'inherit',
    env: process.env,
    windowsHide: true,
  });

  const currentChild = child;
  currentChild.once('error', (error) => {
    log('worker spawn failed', { code: error.code || 'WORKER_SPAWN_FAILED' });
  });
  currentChild.once('exit', (code, signal) => {
    if (child === currentChild) child = null;
    if (stopping) {
      process.exit(0);
      return;
    }

    const now = Date.now();
    pruneRestartTimes(now);
    if (restartTimes.length >= maxRestarts) {
      console.error('[generation-worker-supervisor] restart budget exhausted', {
        code: 'WORKER_RESTART_BUDGET_EXHAUSTED',
        maxRestarts,
        restartWindowMs,
      });
      process.exitCode = 1;
      return;
    }

    restartTimes.push(now);
    const backoffMs = Math.min(baseBackoffMs * (2 ** Math.max(0, restartTimes.length - 1)), 60_000);
    log('worker exited; scheduling restart', { code: code ?? null, signal: signal || null, backoffMs });
    restartTimer = setTimeout(() => {
      restartTimer = null;
      spawnWorker();
    }, backoffMs);
  });
}

log('started', { maxRestarts, restartWindowMs, baseBackoffMs });
spawnWorker();

await new Promise((resolve) => {
  const check = setInterval(() => {
    if (!child && !restartTimer && (stopping || process.exitCode)) {
      clearInterval(check);
      resolve();
    }
  }, 250);
  check.unref();
});

