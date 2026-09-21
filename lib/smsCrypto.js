import 'server-only';

import crypto from 'node:crypto';

function getOtpSecret() {
  const secret = String(process.env.AUTH_VERIFICATION_CODE_SECRET || '').trim();
  if (secret.length < 32) {
    throw Object.assign(new Error('SMS verification secret is not configured'), {
      code: 'SMS_SECRET_NOT_CONFIGURED',
    });
  }
  return secret;
}

export function createOtp() {
  return String(crypto.randomInt(100000, 1000000));
}

export function hashOtp(challengeId, code) {
  return crypto.createHmac('sha256', getOtpSecret())
    .update(`otp:${challengeId}:${String(code)}`)
    .digest('hex');
}

export function compareOtpHash(expected, actual) {
  const left = Buffer.from(String(expected || ''), 'hex');
  const right = Buffer.from(String(actual || ''), 'hex');
  return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}

export function hashRateLimitSubject(scope, subject) {
  return crypto.createHmac('sha256', getOtpSecret())
    .update(`rate:${scope}:${String(subject || '')}`)
    .digest('hex');
}

export function hashDeviceToken(token) {
  return crypto.createHmac('sha256', getOtpSecret())
    .update(`device:${String(token || '')}`)
    .digest('hex');
}

function getEncryptionKey() {
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(getOtpSecret(), 'utf8'),
    Buffer.from('koyosim-sms-provider-session', 'utf8'),
    Buffer.from('firebase-verification-session-v1', 'utf8'),
    32,
  ));
}

export function encryptProviderSession(value) {
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), nonce);
  const ciphertext = Buffer.concat([
    cipher.update(String(value), 'utf8'),
    cipher.final(),
  ]);
  return {
    ciphertext: ciphertext.toString('base64url'),
    nonce: nonce.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
  };
}

export function decryptProviderSession({ ciphertext, nonce, authTag }) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(String(nonce), 'base64url'),
  );
  decipher.setAuthTag(Buffer.from(String(authTag), 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(String(ciphertext), 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}
