import { normalizeProviderError } from '../payments/provider.js';

const circuits = new Map();

function positiveInt(value, fallback) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function transient(error) {
  return Boolean(error?.retryable) || [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(error?.providerStatus || error?.status));
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

export function resetProviderCircuits() { circuits.clear(); }

export function createResilientProvider({
  provider,
  providerName = 'unknown',
  timeoutMs = positiveInt(process.env.PROVIDER_TIMEOUT_MS, 60_000),
  maxAttempts = positiveInt(process.env.PROVIDER_MAX_RETRIES, 2),
  failureThreshold = positiveInt(process.env.PROVIDER_CIRCUIT_FAILURE_THRESHOLD, 5),
  resetMs = positiveInt(process.env.PROVIDER_CIRCUIT_RESET_MS, 30_000),
  sleep: sleepImpl = sleep,
  onCall = null,
} = {}) {
  if (!provider || (typeof provider.generate !== 'function' && typeof provider.submit !== 'function')) {
    throw new TypeError('generation provider must expose generate or submit');
  }

  // 只有幂等的读操作可以在同一家渠道内重试。createTask 一旦超时就无法知道上游
  // 到底有没有收下这次任务，原地重试会开出第二个上游任务、重复占额度也重复计费；
  // 提交类失败一律上抛，由生命周期层按「换渠道」的语义重新安排。
  const attemptsFor = (action) => (action === 'poll' ? Math.max(1, maxAttempts) : 1);

  async function guarded(action, invoke, input) {
    const now = Date.now();
    const state = circuits.get(providerName) || { failures: 0, openedAt: 0 };
    if (state.openedAt && now - state.openedAt < resetMs) {
      throw Object.assign(new Error('模型供应商熔断中，请稍后重试'), { code: 'PROVIDER_CIRCUIT_OPEN', retryable: true });
    }
    if (state.openedAt) { state.openedAt = 0; state.failures = 0; }
    const maxTries = attemptsFor(action);
    let lastError;
    for (let attempt = 1; attempt <= maxTries; attempt += 1) {
      const startedAt = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      let timeoutId;
      try {
        const timeout = new Promise((_, reject) => { timeoutId = setTimeout(() => reject(Object.assign(new Error('模型供应商请求超时'), { code: 'PROVIDER_TIMEOUT', retryable: true })), timeoutMs); });
        const result = await Promise.race([invoke({ ...input, signal: controller.signal }), timeout]);
        clearTimeout(timer);
        clearTimeout(timeoutId);
        circuits.set(providerName, { failures: 0, openedAt: 0 });
        await onCall?.({ provider: providerName, action, status: 'succeeded', latencyMs: Date.now() - startedAt, attempt });
        return result;
      } catch (error) {
        clearTimeout(timer);
        clearTimeout(timeoutId);
        lastError = error?.name === 'AbortError'
          ? Object.assign(new Error('模型供应商请求超时'), { code: 'PROVIDER_TIMEOUT', retryable: true })
          : normalizeProviderError(error, { provider: providerName, action });
        await onCall?.({ provider: providerName, action, status: 'failed', latencyMs: Date.now() - startedAt, attempt, errorCode: lastError.code });
        if (!transient(lastError) || attempt >= maxTries) break;
        await sleepImpl(Math.min(2_000, 100 * (2 ** (attempt - 1))));
      }
    }
    state.failures += 1;
    if (state.failures >= failureThreshold) state.openedAt = Date.now();
    circuits.set(providerName, state);
    throw lastError;
  }

  const wrapped = { ...provider };
  const decorate = (action) => {
    if (typeof provider[action] !== 'function') return;
    const invoke = provider[action].bind(provider);
    wrapped[action] = (input) => guarded(action, invoke, input);
  };
  ['generate', 'submit', 'poll'].forEach(decorate);
  return wrapped;
}

