import test from 'node:test';
import assert from 'node:assert/strict';
import { formatErrorMessage } from '../packages/studio/src/utils/formatError.js';

// Response bodies captured from production, and the string muapi.js:112-114
// actually hands to this formatter: `API Request Failed: ${status} ${statusText} - ${body.slice(0, 100)}`.
const PROVIDER_BODY = '{"detail":{"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance"}},"error":{"code":"INSUFFICIENT_CREDITS","message":"Insufficient credit balance","topup_url":"https://muapi.ai/topup","balance_endpoint":"/api/v1/account/balance"}}';
const PLATFORM_BODY = '{"error":{"code":"INSUFFICIENT_CREDITS","message":"算力点数不足！本次生成需要 20 积分，当前可用 10 积分"}}';

function asClientError(body, status = 402, statusText = 'Payment Required') {
  return new Error(`API Request Failed: ${status} ${statusText} - ${body.slice(0, 100)}`);
}

test('the 100-char client truncation drops the provider account fields', () => {
  const delivered = asClientError(PROVIDER_BODY).message;
  assert.ok(!delivered.includes('topup_url'), 'fixture assumption changed');
  assert.ok(!delivered.includes('balance_endpoint'), 'fixture assumption changed');
});

test('provider credit exhaustion is not shown as the user needing to top up', () => {
  for (const message of [formatErrorMessage(asClientError(PROVIDER_BODY)), formatErrorMessage(PROVIDER_BODY)]) {
    assert.match(message, /provider/i);
    assert.doesNotMatch(message, /top up your wallet/i);
    assert.doesNotMatch(message, /muapi\.ai/i);
  }
});

test('a user-side shortfall keeps its own actionable message', () => {
  assert.equal(formatErrorMessage(asClientError(PLATFORM_BODY)),
    '算力点数不足！本次生成需要 20 积分，当前可用 10 积分');
});

test('bare insufficient-credits errors without a provider signature still ask for a top-up', () => {
  assert.match(formatErrorMessage('API Request Failed: 402 Payment Required'), /top up your wallet/i);
  assert.match(formatErrorMessage('Error 402 INSUFFICIENT_CREDITS'), /top up your wallet/i);
});

test('status codes match on token boundaries, not inside unrelated numbers', () => {
  const unrelated = 'Task 14025 failed after 4028ms, quota 40299 units';
  assert.equal(formatErrorMessage(unrelated), unrelated);
  assert.match(formatErrorMessage('API Request Failed: 401 Unauthorized'), /Authentication failed/);
  assert.match(formatErrorMessage('HTTP 429 Too Many Requests'), /Too many requests/);
});
