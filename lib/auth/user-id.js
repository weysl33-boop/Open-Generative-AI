import crypto from 'node:crypto';

export const MIN_USER_ID_DIGITS = 6;
export const MAX_USER_ID_DIGITS = 64;
export const USER_ID_RANDOM_ATTEMPTS = 32;

export function userIdCapacity(digits) {
  if (!Number.isInteger(digits) || digits < MIN_USER_ID_DIGITS || digits > MAX_USER_ID_DIGITS) {
    throw new RangeError(`User ID length must be between ${MIN_USER_ID_DIGITS} and ${MAX_USER_ID_DIGITS}.`);
  }
  return 9n * (10n ** BigInt(digits - 1));
}

function randomBigIntBelow(limit, randomBytes) {
  const bitLength = (limit - 1n).toString(2).length;
  const byteLength = Math.ceil(bitLength / 8);
  const byteRange = 1n << BigInt(byteLength * 8);
  const acceptanceLimit = byteRange - (byteRange % limit);

  for (;;) {
    const bytes = randomBytes(byteLength);
    let value = 0n;
    for (const byte of bytes) value = (value << 8n) | BigInt(byte);
    if (value < acceptanceLimit) return value % limit;
  }
}

export function randomNumericUserId(digits, randomBytes = crypto.randomBytes) {
  const capacity = userIdCapacity(digits);
  const first = 10n ** BigInt(digits - 1);
  return String(first + randomBigIntBelow(capacity, randomBytes));
}

/**
 * Atomically reserve a random numeric user ID, filling each digit-length pool
 * completely before moving to the next. `reserve` must be an atomic unique
 * insert in the caller's database transaction. The 6–18 digit fallback scans
 * for a genuinely free value after random collisions; it never treats a retry
 * limit as proof that a pool is full.
 */
export async function allocateUserId({
  reserve,
  findFirstAvailable,
  isExhausted,
  randomBytes = crypto.randomBytes,
  minDigits = MIN_USER_ID_DIGITS,
  maxDigits = MAX_USER_ID_DIGITS,
  randomAttempts = USER_ID_RANDOM_ATTEMPTS,
}) {
  if (typeof reserve !== 'function' || typeof findFirstAvailable !== 'function' || typeof isExhausted !== 'function') {
    throw new TypeError('User ID allocator requires reserve, findFirstAvailable, and isExhausted adapters.');
  }

  userIdCapacity(minDigits);
  userIdCapacity(maxDigits);
  if (minDigits > maxDigits) throw new RangeError('Minimum user ID length exceeds maximum.');

  for (let digits = minDigits; digits <= maxDigits; digits += 1) {
    for (;;) {
      for (let attempt = 0; attempt < randomAttempts; attempt += 1) {
        const candidate = randomNumericUserId(digits, randomBytes);
        if (await reserve(candidate, digits)) return candidate;
      }

      if (digits <= 18) {
        const available = await findFirstAvailable(digits);
        if (available === null) break;
        if (typeof available !== 'string' || !new RegExp(`^[1-9][0-9]{${digits - 1}}$`).test(available)) {
          throw new TypeError(`Available user ID must contain exactly ${digits} digits.`);
        }
        if (await reserve(available, digits)) return available;
        // Another transaction won this candidate. Re-check the same pool.
        continue;
      }

      // At larger lengths a complete pool is beyond any realistic PostgreSQL
      // table size; still check exact exhaustion before considering the next
      // length, and otherwise continue sampling this pool.
      if (await isExhausted(digits)) break;
    }
  }

  throw new RangeError(`No numeric user ID capacity remains up to ${maxDigits} digits.`);
}

