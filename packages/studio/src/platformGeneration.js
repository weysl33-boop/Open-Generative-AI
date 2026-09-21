const SUCCESS_STATUSES = new Set(['succeeded', 'completed', 'success']);
const FAILURE_STATUSES = new Set(['failed', 'error', 'cancelled', 'canceled']);

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function createIdempotencyKey() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  const values = new Uint8Array(16);
  globalThis.crypto?.getRandomValues?.(values);
  const suffix = [...values].map((value) => value.toString(16).padStart(2, '0')).join('');
  return `studio-${Date.now()}-${suffix || Math.random().toString(36).slice(2)}`;
}

function generationId(payload) {
  return payload?.creation_id || payload?.creation?.id || payload?.id || payload?.request_id || null;
}

async function readJson(response) {
  return response.json().catch(() => ({}));
}

function requestError(payload, response, fallback) {
  const error = new Error(payload?.error || payload?.message || fallback);
  error.status = response.status;
  error.code = payload?.code || `HTTP_${response.status}`;
  const id = generationId(payload);
  if (id) error.requestId = id;
  return error;
}

function failedGeneration(creation, creationId) {
  const detail = creation.error_reason || creation.error_message || '生成失败，已释放预扣额度';
  const error = new Error(`Generation failed: ${detail}`);
  error.code = creation.error_code || 'GENERATION_FAILED';
  error.requestId = creationId;
  error.generationResult = {
    id: creationId,
    request_id: creationId,
    status: creation.status,
    error: { message: detail, code: error.code },
    cost: {
      refunded: true,
      amount_credits: Number(creation.credit_cost || 0),
    },
  };
  return error;
}

function completedGeneration(creation, creationId) {
  const url = creation.result_url || creation.resultUrl || null;
  return {
    id: creationId,
    request_id: creationId,
    status: 'completed',
    url,
    result_url: url,
    outputs: url ? [url] : [],
    cost: {
      refunded: false,
      amount_credits: Number(creation.credit_cost || 0),
    },
  };
}

/**
 * Submit a hosted Studio generation through the platform-owned billing API.
 * Provider credentials are deliberately not accepted by this client boundary.
 */
export async function submitPlatformGeneration({
  modelId,
  studioId = 'studio',
  prompt = '',
  parameters = {},
  label,
  idempotencyKey = createIdempotencyKey(),
  onRequestId,
  maxAttempts = 900,
  intervalMs = 2_000,
  fetchImpl = globalThis.fetch,
  waitImpl = wait,
  onAuthRequired,
} = {}) {
  if (!modelId) throw new Error('A model ID is required for platform generation.');
  if (typeof fetchImpl !== 'function') throw new Error('Platform generation transport is unavailable.');

  const submitResponse = await fetchImpl('/api/generations', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({ modelId, studioId, prompt, parameters, label }),
  });
  const submitData = await readJson(submitResponse);

  if (!submitResponse.ok) {
    const error = requestError(submitData, submitResponse, 'Could not create the generation task.');
    onAuthRequired?.(submitResponse.status, submitData?.error || '');
    throw error;
  }

  const creationId = generationId(submitData);
  if (!creationId) {
    throw Object.assign(new Error('The platform accepted the request without returning a task ID.'), {
      code: 'GENERATION_RESPONSE_INVALID',
    });
  }
  onRequestId?.(creationId);

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    await waitImpl(intervalMs);
    const pollResponse = await fetchImpl(`/api/generations?id=${encodeURIComponent(creationId)}`, {
      method: 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    const trace = await readJson(pollResponse);
    if (!pollResponse.ok) {
      const error = requestError(trace, pollResponse, 'Could not read the generation task.');
      onAuthRequired?.(pollResponse.status, trace?.error || '');
      if (pollResponse.status >= 500 && attempt + 1 < maxAttempts) continue;
      throw error;
    }

    const creation = trace.creation || trace.task || trace;
    const status = String(creation.status || trace.status || '').toLowerCase();
    if (SUCCESS_STATUSES.has(status)) return completedGeneration(creation, creationId);
    if (FAILURE_STATUSES.has(status)) throw failedGeneration(creation, creationId);
  }

  const error = new Error(`Generation timed out after polling. Request ID: ${creationId}`);
  error.code = 'GENERATION_TIMEOUT';
  error.requestId = creationId;
  throw error;
}
