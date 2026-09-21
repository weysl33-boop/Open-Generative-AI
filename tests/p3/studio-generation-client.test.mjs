import test from 'node:test';
import assert from 'node:assert/strict';

import { submitPlatformGeneration } from '../../packages/studio/src/platformGeneration.js';

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

test('hosted Studio submits and polls a server-billed generation task without provider credentials', async () => {
  const calls = [];
  const requestIds = [];
  let pollCount = 0;

  const result = await submitPlatformGeneration({
    modelId: 'flux-dev',
    studioId: 'image',
    prompt: 'a lighthouse at dawn',
    parameters: { prompt: 'a lighthouse at dawn', aspect_ratio: '1:1' },
    idempotencyKey: 'studio-request-123',
    maxAttempts: 3,
    intervalMs: 0,
    waitImpl: async () => {},
    onRequestId: (id) => requestIds.push(id),
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), init });
      if (String(url) === '/api/generations') {
        return jsonResponse({ creation_id: 'gen_test_123', status: 'queued' }, 202);
      }
      if (String(url) === '/api/generations?id=gen_test_123') {
        pollCount += 1;
        return jsonResponse({
          creation: pollCount === 1
            ? { id: 'gen_test_123', status: 'processing' }
            : { id: 'gen_test_123', status: 'succeeded', result_url: 'https://assets.example.test/result.png' },
        });
      }
      throw new Error(`Unexpected generation request: ${String(url)}`);
    },
  });

  assert.equal(calls[0].url, '/api/generations');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers['Idempotency-Key'], 'studio-request-123');
  assert.equal(Object.keys(calls[0].init.headers).some((key) => key.toLowerCase() === 'x-api-key'), false);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    modelId: 'flux-dev',
    studioId: 'image',
    prompt: 'a lighthouse at dawn',
    parameters: { prompt: 'a lighthouse at dawn', aspect_ratio: '1:1' },
  });
  assert.deepEqual(requestIds, ['gen_test_123']);
  assert.equal(pollCount, 2);
  assert.equal(calls[1].url, '/api/generations?id=gen_test_123');
  assert.equal(result.url, 'https://assets.example.test/result.png');
  assert.deepEqual(result.outputs, ['https://assets.example.test/result.png']);
  assert.equal(result.status, 'completed');
});

test('hosted Studio propagates insufficient-credit responses instead of falling back upstream', async () => {
  const calls = [];

  await assert.rejects(
    () => submitPlatformGeneration({
      modelId: 'flux-dev',
      studioId: 'image',
      prompt: 'a lighthouse at dawn',
      parameters: { prompt: 'a lighthouse at dawn' },
      idempotencyKey: 'studio-request-402',
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        return jsonResponse({ code: 'INSUFFICIENT_CREDITS', error: '算力额度不足' }, 402);
      },
    }),
    (error) => error.status === 402 && error.code === 'INSUFFICIENT_CREDITS',
  );

  assert.deepEqual(calls.map((call) => call.url), ['/api/generations']);
});

test('the public image-generation API uses the platform billing client on hosted Studio', async () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  const previousFetch = globalThis.fetch;
  const calls = [];
  let accountGateCalls = 0;

  globalThis.window = {
    location: { protocol: 'https:', pathname: '/zh/studio' },
    __KOYOSIM_REQUIRE_ACCOUNT__: async () => {
      accountGateCalls += 1;
      return { id: 'user_test' };
    },
  };
  globalThis.document = { cookie: 'muapi_key=must-not-be-used' };
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === '/api/generations') {
      return jsonResponse({ creation_id: 'gen_hosted_1', status: 'queued' }, 202);
    }
    if (String(url) === '/api/generations?id=gen_hosted_1') {
      return jsonResponse({ creation: { id: 'gen_hosted_1', status: 'succeeded', result_url: 'https://assets.example.test/hosted.png' } });
    }
    return jsonResponse({ url: 'https://upstream.example.test/unmetered.png' });
  };

  try {
    const { generateImage } = await import('../../packages/studio/src/muapi.js');
    const result = await generateImage('caller-supplied-key-must-not-be-used', {
      model: 'flux-dev',
      prompt: 'a lighthouse at dawn',
      aspect_ratio: '1:1',
    });

    assert.equal(accountGateCalls, 1);
    assert.equal(calls[0].url, '/api/generations');
    assert.equal(JSON.parse(calls[0].init.body).modelId, 'flux-dev');
    assert.equal(calls.some((call) => call.url.startsWith('/api/api/v1/')), false);
    assert.equal(JSON.stringify(calls[0].init.headers).includes('must-not-be-used'), false);
    assert.equal(result.url, 'https://assets.example.test/hosted.png');
  } finally {
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    globalThis.fetch = previousFetch;
  }
});
