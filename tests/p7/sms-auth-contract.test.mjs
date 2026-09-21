import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = (relative) => fs.readFileSync(path.join(repoRoot, relative), 'utf8');

test('phone normalization emits mature-library validated E.164 across domestic and global examples', async () => {
  const { normalizePhone, getPhoneLookupCandidates, getPhoneCountry } = await import('../../lib/auth/phone.js');
  assert.equal(normalizePhone('13800138000', '+86').e164, '+8613800138000');
  assert.equal(normalizePhone('+14155552671', '+86').callingCode, '+1');
  assert.equal(normalizePhone('07911123456', '+44').e164, '+447911123456');
  assert.equal(normalizePhone('91234567', '+852').e164, '+85291234567');
  assert.equal(getPhoneCountry('+819012345678'), 'JP');
  assert.deepEqual(getPhoneLookupCandidates('07911123456', '+44'), ['+447911123456', '7911123456', '07911123456']);
  assert.throws(() => normalizePhone('not-a-number', '+86'), { code: 'INVALID_PHONE' });
  assert.throws(() => normalizePhone('1234567890', '+999'), { code: 'UNSUPPORTED_COUNTRY' });
});

test('OTP secrets are HMACed, compared safely, and Firebase sessions are encrypted at rest', async () => {
  process.env.AUTH_VERIFICATION_CODE_SECRET = `sms-test-${'k'.repeat(48)}`;
  const { createOtp, hashOtp, compareOtpHash, encryptProviderSession, decryptProviderSession } = await import('../../lib/smsCrypto.js');
  const code = createOtp();
  const digest = hashOtp('challenge-test', code);
  assert.match(code, /^\d{6}$/);
  assert.match(digest, /^[a-f0-9]{64}$/);
  assert.notEqual(digest, code);
  assert.equal(compareOtpHash(digest, hashOtp('challenge-test', code)), true);
  assert.equal(compareOtpHash(digest, hashOtp('challenge-test', String((Number(code) + 1) % 1000000).padStart(6, '0'))), false);

  const sessionInfo = 'firebase-session-information-for-test-only';
  const encrypted = encryptProviderSession(sessionInfo);
  assert.ok(encrypted.ciphertext);
  assert.ok(encrypted.nonce);
  assert.ok(encrypted.authTag);
  assert.notEqual(encrypted.ciphertext, sessionInfo);
  assert.equal(decryptProviderSession(encrypted), sessionInfo);
});

test('SMS endpoints never return OTPs or accept a browser-selected delivery provider', () => {
  const send = source('app/api/auth/phone/send-code/route.js');
  const verify = source('app/api/auth/phone/verify/route.js');
  const modal = source('components/AuthModal.js');
  assert.match(send, /Object\.hasOwn\(body, 'provider'\)/);
  assert.doesNotMatch(send, /devCode|verificationCode:\s*code/);
  assert.doesNotMatch(verify, /devCode|providerResponse|stack/);
  assert.doesNotMatch(modal, /devCode|123456/);
  assert.match(send, /requestPhoneOtp/);
  assert.match(verify, /verifyPhoneOtp/);
});

test('invalid input is rejected before SMS routing or provider access', async () => {
  const { requestPhoneOtp } = await import('../../lib/smsService.js');
  const result = await requestPhoneOtp({
    phone: 'not-a-phone',
    countryCode: '+86',
    purpose: 'login',
    ip: '127.0.0.1',
    deviceToken: 'test-device-token-012345678901234567890123456',
  });
  assert.equal(result.error, 'INVALID_PHONE');
  assert.equal(result.status, 400);
  assert.equal(result.success, undefined);
});

test('SMS provider adapters implement the shared interface and only retryable send faults permit fallback', async () => {
  const { SmsProvider, TencentSmsProvider, AliyunSmsProvider, FirebasePhoneProvider, isRetryableProviderError } = await import('../../lib/smsProviders.js');
  for (const Provider of [SmsProvider, TencentSmsProvider, AliyunSmsProvider, FirebasePhoneProvider]) {
    const instance = new Provider('contract-test');
    assert.equal(typeof instance.sendOtp, 'function');
    assert.equal(typeof instance.verifyOtp, 'function');
    assert.equal(typeof instance.healthCheck, 'function');
  }
  assert.equal(isRetryableProviderError({ code: 'PROVIDER_UNAVAILABLE', retryable: true }), true);
  assert.equal(isRetryableProviderError({ code: 'PROVIDER_UNAUTHORIZED', retryable: false }), false);
  assert.equal(isRetryableProviderError({ code: 'OTP_INCORRECT' }), false);
});

test('SMS admin controls are permissioned, secret-write only, and health is provider-backed', () => {
  const adminRead = source('app/api/admin/providers/sms/route.js');
  const adminSecrets = source('app/api/admin/providers/sms/secrets/route.js');
  const adminHealth = source('app/api/admin/providers/sms/health/route.js');
  const adminService = source('lib/smsAdmin.js');
  assert.match(adminRead, /PERMISSIONS\.providersRead/);
  assert.match(adminRead, /PERMISSIONS\.providersWrite/);
  assert.match(adminSecrets, /PERMISSIONS\.providersWrite/);
  assert.match(adminSecrets, /Idempotency-Key/);
  assert.match(adminService, /verifyAdminPassword/);
  assert.match(adminService, /getSmsProviderStats/);
  assert.match(adminHealth, /runSmsProviderHealthCheck/);
  assert.doesNotMatch(adminService, /status:\s*'healthy'/);
});

test('OTP migration is additive, E.164-oriented, attempt-limited, and phone logs are masked', () => {
  const migration = source('lib/db/migrations/027_sms_auth.sql');
  const logsRepo = source('lib/repositories/sms.js');
  const smsService = source('lib/smsService.js');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS auth_usr\.otp_challenges/);
  assert.match(migration, /phone_e164/);
  assert.match(migration, /code_hash/);
  assert.match(migration, /provider_session_ciphertext/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS auth_usr\.sms_delivery_logs/);
  assert.match(migration, /masked_phone/);
  assert.doesNotMatch(migration, /ALTER TABLE auth_usr\.users|DROP TABLE|DROP COLUMN|users\.id\s*=\s*[^;]+/i);
  assert.match(logsRepo, /attempt_count = attempt_count \+ 1/);
  assert.match(logsRepo, /masked_phone/);
  assert.match(logsRepo, /findLatestSentOtpChallenge/);
  assert.match(smsService, /challengeId \|\| \(await smsRepo\.findLatestSentOtpChallenge/);
});

test('phone account linking stays attached to users.id and requires an authenticated binding path', () => {
  const phoneIdentity = source('lib/repositories/phoneIdentity.js');
  const bindingRoute = source('app/api/user/phone/route.js');
  assert.match(phoneIdentity, /bindVerifiedPhoneIdentity/);
  assert.match(phoneIdentity, /userId/);
  assert.match(phoneIdentity, /PHONE_ALREADY_BOUND/);
  assert.match(bindingRoute, /getUserFromRequest/);
  assert.match(bindingRoute, /purpose:\s*'bind'/);
  assert.match(bindingRoute, /bindVerifiedPhoneIdentity/);
  assert.match(phoneIdentity, /PHONE_ALREADY_BOUND/);
});
