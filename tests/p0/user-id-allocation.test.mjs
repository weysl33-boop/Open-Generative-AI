import test from 'node:test';
import assert from 'node:assert/strict';
import { allocateUserId, randomNumericUserId, userIdCapacity } from '../../lib/auth/user-id.js';

function bytesFor(value, size) {
  let remaining = BigInt(value);
  const bytes = new Uint8Array(size);
  for (let index = size - 1; index >= 0; index -= 1) {
    bytes[index] = Number(remaining & 255n);
    remaining >>= 8n;
  }
  return bytes;
}

test('random numeric user IDs preserve the configured digit length and pool bounds', () => {
  assert.equal(userIdCapacity(6), 900_000n);
  assert.equal(randomNumericUserId(6, (size) => bytesFor(0n, size)), '100000');

  const sixDigitCapacity = userIdCapacity(6);
  const sixDigitAcceptanceLimit = (1n << 24n) - ((1n << 24n) % sixDigitCapacity);
  assert.equal(randomNumericUserId(6, (size) => bytesFor(sixDigitAcceptanceLimit - 1n, size)), '999999');
  assert.equal(randomNumericUserId(7, (size) => bytesFor(0n, size)), '1000000');
  assert.throws(() => randomNumericUserId(5), RangeError);
});

test('allocator uses a free six-digit ID instead of advancing after random collisions', async () => {
  const reserved = new Set(Array.from({ length: 899_999 }, (_, index) => String(100000 + index)));
  const id = await allocateUserId({
    reserve: async (candidate) => {
      if (reserved.has(candidate)) return false;
      reserved.add(candidate);
      return true;
    },
    findFirstAvailable: async (digits) => {
      assert.equal(digits, 6);
      return '999999';
    },
    isExhausted: async () => false,
    randomBytes: (size) => bytesFor(0n, size),
    randomAttempts: 2,
    minDigits: 6,
    maxDigits: 7,
  });

  assert.equal(id, '999999');
  assert.equal(reserved.has('1000000'), false);
});

test('allocator advances to seven digits only after the six-digit pool is exhausted', async () => {
  const observedLengths = [];
  const id = await allocateUserId({
    reserve: async (candidate, digits) => {
      observedLengths.push(digits);
      return digits === 7 && candidate === '1000000';
    },
    findFirstAvailable: async (digits) => {
      assert.equal(digits, 6);
      return null;
    },
    isExhausted: async () => false,
    randomBytes: (size) => bytesFor(0n, size),
    randomAttempts: 1,
    minDigits: 6,
    maxDigits: 7,
  });

  assert.equal(id, '1000000');
  assert.deepEqual(observedLengths, [6, 7]);
});

