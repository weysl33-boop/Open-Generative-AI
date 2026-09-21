import 'server-only';

import { normalizePhone, validatePhone } from './auth/phone.js';
import { createOtp } from './smsCrypto.js';
import { requestPhoneOtp, verifyPhoneOtp } from './smsService.js';

// Preserve the existing function names for internal callers while delegating
// all new sends/verifications to the challenge-based implementation.

export function generateVerificationCode() {
  return createOtp();
}

export function normalizePhoneNumber(phone, countryCode = '+86') {
  const normalized = normalizePhone(phone, countryCode);
  return {
    rawPhone: normalized.nationalNumber,
    countryCode: normalized.callingCode,
    fullPhone: normalized.e164,
  };
}

export function validatePhoneNumber(phone, countryCode = '+86') {
  return validatePhone(phone, countryCode);
}

export async function sendSmsVerificationCode({ phone, countryCode = '+86', type = 'login', ip = null, userId = null, deviceToken, ...challenge }) {
  if (!deviceToken) return { error: '请刷新页面后重试' };
  return requestPhoneOtp({
    phone,
    countryCode,
    purpose: type === 'bind' ? 'bind' : 'login',
    ip,
    userId,
    deviceToken,
    ...challenge,
  });
}

export async function verifySmsCode({ phone, countryCode = '+86', code, type = 'login', ip = null, userId = null, deviceToken, challengeId }) {
  const result = await verifyPhoneOtp({
    phone,
    countryCode,
    code,
    purpose: type === 'bind' ? 'bind' : 'login',
    ip,
    userId,
    deviceToken,
    challengeId,
  });
  return result.success ? { success: true, target: result.phone } : { error: result.message, code: result.error };
}
