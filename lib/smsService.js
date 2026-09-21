import 'server-only';

import { nowIso, randomId, withTransaction } from './db/index.js';
import { maskPhone, normalizePhone } from './auth/phone.js';
import {
  compareOtpHash,
  createOtp,
  decryptProviderSession,
  encryptProviderSession,
  hashDeviceToken,
  hashOtp,
  hashRateLimitSubject,
} from './smsCrypto.js';
import { recordAuthEvent } from './repositories/auth.js';
import * as smsRepo from './repositories/sms.js';
import { consumeRateLimit } from './security/requestGuard.js';
import { getFirebaseWebConfig, getSmsConfiguration, getSmsProviderCredentials } from './smsConfig.js';
import { resolveSmsRoute } from './smsRouter.js';
import {
  AliyunSmsProvider,
  FirebasePhoneProvider,
  TencentSmsProvider,
  isRetryableProviderError,
  verifyTencentCaptcha,
} from './smsProviders.js';

const OTP_LIFETIME_MS = 5 * 60 * 1000;
const RESEND_COOLDOWN_MS = 60 * 1000;
const MAX_SENDS_10M = 5;
const MAX_SENDS_24H = 10;
const MAX_OTP_ATTEMPTS = 5;
const CHALLENGE_RISK_THRESHOLD = 3;
const OTP_CHALLENGE_RETENTION_MS = 24 * 60 * 60 * 1000;
let lastChallengePurgeAt = 0;
const PROVIDERS = Object.freeze({
  tencent_sms: () => new TencentSmsProvider(),
  aliyun_sms: () => new AliyunSmsProvider(),
  firebase_phone: () => new FirebasePhoneProvider(),
});

const PUBLIC_ERRORS = Object.freeze({
  INVALID_PHONE: { status: 400, message: '请输入有效的手机号' },
  UNSUPPORTED_COUNTRY: { status: 400, message: '暂不支持该国家或地区的手机号' },
  SMS_PROVIDER_DISABLED: { status: 503, message: '短信登录通道暂不可用，请稍后重试' },
  SMS_PROVIDER_UNAVAILABLE: { status: 503, message: '短信登录通道暂不可用，请稍后重试' },
  SMS_PROVIDER_NOT_CONFIGURED: { status: 503, message: '短信服务尚未完成配置，请稍后重试' },
  PROVIDER_UNAUTHORIZED: { status: 503, message: '短信服务暂不可用，请稍后重试' },
  PROVIDER_QUOTA_EXCEEDED: { status: 503, message: '短信服务暂不可用，请稍后重试' },
  PROVIDER_REQUEST_REJECTED: { status: 503, message: '验证码发送失败，请稍后重试' },
  PROVIDER_UNAVAILABLE: { status: 503, message: '验证码发送失败，请稍后重试' },
  PROVIDER_SERVICE_ERROR: { status: 503, message: '验证码发送失败，请稍后重试' },
  APP_VERIFICATION_REQUIRED: { status: 428, message: '需要完成安全验证后才能发送验证码' },
  CAPTCHA_INVALID: { status: 428, message: '安全验证未通过，请重试' },
  CAPTCHA_NOT_CONFIGURED: { status: 503, message: '安全验证暂不可用，请稍后重试' },
  OTP_RATE_LIMITED: { status: 429, message: '发送过于频繁，请稍后再试' },
  OTP_MISSING: { status: 400, message: '请重新获取验证码' },
  OTP_EXPIRED: { status: 400, message: '验证码已过期，请重新获取' },
  OTP_INCORRECT: { status: 400, message: '验证码错误，请重新输入' },
  OTP_ATTEMPTS_EXCEEDED: { status: 400, message: '验证码尝试次数过多，请重新获取' },
  PHONE_ALREADY_BOUND: { status: 409, message: '该手机号码已绑定其他账户，请先登录该账户再操作' },
  SMS_INTERNAL_ERROR: { status: 500, message: '短信服务暂不可用，请稍后重试' },
});

function failure(code, retryAfterSeconds = null) {
  const mapped = PUBLIC_ERRORS[code] || PUBLIC_ERRORS.SMS_INTERNAL_ERROR;
  return {
    error: code,
    message: mapped.message,
    status: mapped.status,
    retryAfterSeconds: retryAfterSeconds || undefined,
  };
}

function makeChallengeId() {
  return randomId('otp');
}

async function purgeStaleChallengesBestEffort() {
  if (Date.now() - lastChallengePurgeAt < 60 * 60 * 1000) return;
  lastChallengePurgeAt = Date.now();
  try {
    await smsRepo.purgeStaleOtpChallenges(new Date(Date.now() - OTP_CHALLENGE_RETENTION_MS).toISOString());
  } catch (error) {
    console.error('[sms/challenge-retention]', { code: error?.code || 'PURGE_FAILED' });
  }
}

async function applySendLimits({ ip, deviceHash, country, userId, sessionToken }) {
  const limits = [
    { scope: 'auth_sms_ip', subject: hashRateLimitSubject('ip', ip), limit: 10, windowMs: 60 * 60 * 1000 },
    { scope: 'auth_sms_device', subject: deviceHash, limit: 5, windowMs: 60 * 60 * 1000 },
    { scope: 'auth_sms_country', subject: country, limit: 5000, windowMs: 60 * 60 * 1000 },
  ];
  if (userId) {
    limits.push({ scope: 'auth_sms_session', subject: userId, limit: 10, windowMs: 60 * 60 * 1000 });
  }
  if (sessionToken) {
    limits.push({ scope: 'auth_sms_session_token', subject: hashRateLimitSubject('session', sessionToken), limit: 10, windowMs: 60 * 60 * 1000 });
  }
  for (const item of limits) {
    const result = await consumeRateLimit(item);
    if (!result.allowed) return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
  }
  return { allowed: true };
}

async function applyVerifyLimits({ ip, deviceHash, phone, userId, sessionToken }) {
  const limits = [
    { scope: 'auth_sms_verify_ip', subject: hashRateLimitSubject('ip', ip), limit: 30, windowMs: 15 * 60 * 1000 },
    { scope: 'auth_sms_verify_device', subject: deviceHash, limit: 20, windowMs: 15 * 60 * 1000 },
    { scope: 'auth_sms_verify_phone', subject: hashRateLimitSubject('phone', phone), limit: 30, windowMs: 15 * 60 * 1000 },
  ];
  if (userId) limits.push({ scope: 'auth_sms_verify_session', subject: userId, limit: 30, windowMs: 15 * 60 * 1000 });
  if (sessionToken) {
    limits.push({ scope: 'auth_sms_verify_session_token', subject: hashRateLimitSubject('session', sessionToken), limit: 30, windowMs: 15 * 60 * 1000 });
  }
  for (const item of limits) {
    const result = await consumeRateLimit(item);
    if (!result.allowed) return { allowed: false, retryAfterSeconds: result.retryAfterSeconds };
  }
  return { allowed: true };
}

async function sendThroughRoute({ challenge, phone, code, recaptchaToken, route }) {
  const attempts = [route.provider];
  if (route.fallback) attempts.push(route.fallback);
  let lastError = null;

  for (let index = 0; index < attempts.length; index += 1) {
    const attempt = attempts[index];
    const startedAt = Date.now();
    try {
      const response = await attempt.provider.sendOtp({ phone, code, recaptchaToken });
      const providerSession = response.providerSession ? encryptProviderSession(response.providerSession) : null;
      await smsRepo.markOtpChallengeSent({
        id: challenge.id,
        provider: attempt.id,
        codeHash: code ? hashOtp(challenge.id, code) : null,
        providerSession,
        timestamp: nowIso(),
      });
      await smsRepo.recordSmsDelivery({
        provider: attempt.id,
        phoneMasked: maskPhone(phone.e164),
        country: phone.country,
        status: 'success',
        latencyMs: Date.now() - startedAt,
        challengeId: challenge.id,
        timestamp: nowIso(),
      });
      await recordAuthEvent({
        eventType: 'OTP_SENT',
        target: maskPhone(phone.e164),
        requestIp: challenge.ip || null,
        metadata: { provider: attempt.id, purpose: challenge.purpose },
      });
      return { success: true, provider: attempt.id };
    } catch (error) {
      const mapped = error?.code || 'PROVIDER_SERVICE_ERROR';
      lastError = error;
      await smsRepo.recordSmsDelivery({
        provider: attempt.id,
        phoneMasked: maskPhone(phone.e164),
        country: phone.country,
        status: 'failed',
        errorCode: mapped,
        latencyMs: Date.now() - startedAt,
        challengeId: challenge.id,
        timestamp: nowIso(),
      });
      console.error('[sms/provider-send]', { provider: attempt.id, code: mapped });
      if (!route.fallback || index > 0 || !isRetryableProviderError(error)) break;
    }
  }

  const errorCode = lastError?.code || 'PROVIDER_SERVICE_ERROR';
  await smsRepo.setOtpChallengeStatus({
    id: challenge.id,
    status: 'send_failed',
    errorCode,
    timestamp: nowIso(),
  });
  await recordAuthEvent({
    eventType: 'OTP_FAILED',
    target: maskPhone(phone.e164),
    requestIp: challenge.ip || null,
    metadata: { provider: challenge.provider, errorCode, purpose: challenge.purpose },
  });
  return failure(errorCode);
}

async function buildInitialChallenge({ normalized, route, purpose, userId, ip, deviceHash }) {
  const now = new Date();
  const nowIsoValue = now.toISOString();
  const ipHash = ip ? hashRateLimitSubject('challenge-ip', ip) : null;
  const firebaseConfig = route.provider.id === 'firebase_phone' ? await getFirebaseWebConfig() : null;
  const captchaConfig = route.config.providers.tencent_captcha;
  const captchaCredentials = normalized.callingCode === '+86'
    ? await getSmsProviderCredentials('tencent_captcha')
    : null;
  const captchaConfigured = Boolean(
    captchaConfig.enabled !== false
      && captchaConfig.appId
      && captchaCredentials?.secret_id
      && captchaCredentials?.secret_key
      && captchaCredentials?.app_secret_key,
  );

  const limitResult = await withTransaction(async (tx) => {
    await smsRepo.lockOtpPhone(normalized.e164, tx);
    const counts = await smsRepo.countPhoneSends(normalized.e164, nowIsoValue, tx);
    if (counts.last_send_at) {
      const retry = Math.max(1, Math.ceil((new Date(counts.last_send_at).getTime() + RESEND_COOLDOWN_MS - now.getTime()) / 1000));
      return { error: 'OTP_RATE_LIMITED', retryAfterSeconds: retry };
    }
    if (Number(counts.sends_10m || 0) >= MAX_SENDS_10M || Number(counts.sends_24h || 0) >= MAX_SENDS_24H) {
      return { error: 'OTP_RATE_LIMITED', retryAfterSeconds: Number(counts.sends_10m || 0) >= MAX_SENDS_10M ? 600 : 86400 };
    }

    const activity = await smsRepo.countRecentSmsActivity({
      ipHash,
      deviceHash,
      since: new Date(now.getTime() - 15 * 60 * 1000).toISOString(),
    }, tx);
    const riskChallenge = normalized.callingCode === '+86'
      && Math.max(Number(activity.ip_count || 0), Number(activity.device_count || 0)) >= CHALLENGE_RISK_THRESHOLD;
    const requiresCaptcha = route.provider.id === 'firebase_phone' || riskChallenge;

    if (riskChallenge && !captchaConfigured) return { error: 'CAPTCHA_NOT_CONFIGURED' };
    if (route.provider.id === 'firebase_phone' && !firebaseConfig) {
      return { error: 'SMS_PROVIDER_NOT_CONFIGURED' };
    }

    const challengeId = makeChallengeId();
    const code = requiresCaptcha || route.provider.id === 'firebase_phone' ? null : createOtp();
    const challenge = await smsRepo.createOtpChallenge({
      id: challengeId,
      phone: normalized.e164,
      country: normalized.country,
      provider: route.provider.id,
      purpose,
      userId,
      deviceHash,
      ipHash,
      codeHash: code ? hashOtp(challengeId, code) : null,
      status: requiresCaptcha ? 'captcha_pending' : 'pending',
      expiresAt: new Date(now.getTime() + OTP_LIFETIME_MS).toISOString(),
      createdAt: nowIsoValue,
    }, tx);
    await smsRepo.cancelOtherPhoneChallenges({
      phone: normalized.e164,
      purpose,
      exceptId: challengeId,
      timestamp: nowIsoValue,
    }, tx);

    return { challenge, code, requiresCaptcha, riskChallenge };
  });

  if (limitResult.error) return { result: failure(limitResult.error, limitResult.retryAfterSeconds) };
  return { value: limitResult };
}

async function startProviderSend({ challenge, normalized, route, code, recaptchaToken }) {
  const activeRoute = {
    ...route,
    provider: { id: challenge.provider, provider: PROVIDERS[challenge.provider]() },
  };
  return sendThroughRoute({ challenge, phone: normalized, code, recaptchaToken, route: activeRoute });
}

async function resumeCaptchaChallenge({ challengeId, normalized, purpose, userId, deviceHash, ip, recaptchaToken, captchaTicket, captchaRandstr }) {
  const challenge = await smsRepo.findOtpChallengeForUpdate(challengeId);
  if (!challenge || challenge.phone_e164 !== normalized.e164 || challenge.purpose !== purpose || challenge.device_hash !== deviceHash) {
    return { result: failure('OTP_MISSING') };
  }
  if (challenge.user_id !== (userId || null)) return { result: failure('OTP_MISSING') };
  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await smsRepo.setOtpChallengeStatus({ id: challenge.id, status: 'expired', timestamp: nowIso() });
    return { result: failure('OTP_EXPIRED') };
  }
  if (challenge.status !== 'captcha_pending') return { result: failure('OTP_MISSING') };
  if (Number(challenge.attempt_count) >= MAX_OTP_ATTEMPTS) {
    await smsRepo.setOtpChallengeStatus({ id: challenge.id, status: 'invalid', timestamp: nowIso() });
    return { result: failure('OTP_ATTEMPTS_EXCEEDED') };
  }

  let code = null;
  if (challenge.provider === 'firebase_phone') {
    if (!recaptchaToken) return { result: failure('APP_VERIFICATION_REQUIRED') };
  } else {
    try {
      await verifyTencentCaptcha({ ticket: captchaTicket, randstr: captchaRandstr, userIp: ip });
    } catch (error) {
      const attempted = await smsRepo.incrementOtpAttempt({
        id: challenge.id,
        maxAttempts: MAX_OTP_ATTEMPTS,
        timestamp: nowIso(),
      });
      await recordAuthEvent({
        eventType: 'OTP_FAILED',
        target: maskPhone(normalized.e164),
        requestIp: ip,
        metadata: { provider: challenge.provider, purpose, errorCode: error.code || 'CAPTCHA_INVALID' },
      });
      return { result: failure(attempted?.status === 'invalid' ? 'OTP_ATTEMPTS_EXCEEDED' : 'CAPTCHA_INVALID') };
    }
    code = createOtp();
  }

  const claimed = await withTransaction(async (tx) => {
    const current = await smsRepo.findOtpChallengeForUpdate(challenge.id, tx);
    if (!current || current.status !== 'captcha_pending' || new Date(current.expires_at).getTime() <= Date.now()) return false;
    await smsRepo.setOtpChallengeStatus({ id: current.id, status: 'pending', timestamp: nowIso() }, tx);
    return true;
  });
  if (!claimed) return { result: failure('OTP_MISSING') };

  const route = await resolveSmsRoute(normalized);
  if (route.error) {
    await smsRepo.setOtpChallengeStatus({ id: challenge.id, status: 'send_failed', errorCode: route.error, timestamp: nowIso() });
    return { result: failure(route.error) };
  }
  const response = await startProviderSend({
    challenge: { ...challenge, status: 'pending', ip, provider: challenge.provider },
    normalized,
    route,
    code,
    recaptchaToken,
  });
  if (!response.success) return { result: response };
  return {
    result: {
      success: true,
      challengeId: challenge.id,
      cooldown: 60,
      expiresInSeconds: 300,
    },
  };
}

export async function requestPhoneOtp({
  phone,
  countryCode = '+86',
  purpose = 'login',
  userId = null,
  sessionToken = null,
  ip = null,
  deviceToken,
  challengeId = null,
  recaptchaToken = null,
  captchaTicket = null,
  captchaRandstr = null,
}) {
  if (!['login', 'bind'].includes(purpose)) return failure('OTP_MISSING');
  if (purpose === 'bind' && !userId) return { ...failure('OTP_MISSING'), status: 401, message: '请先登录' };

  let normalized;
  try {
    normalized = normalizePhone(phone, countryCode);
  } catch (error) {
    return failure(error.code || 'INVALID_PHONE');
  }

  const deviceHash = hashDeviceToken(deviceToken);
  await purgeStaleChallengesBestEffort();
  if (challengeId) {
    const result = await resumeCaptchaChallenge({
      challengeId,
      normalized,
      purpose,
      userId,
      deviceHash,
      ip,
      recaptchaToken,
      captchaTicket,
      captchaRandstr,
    });
    return result.result;
  }

  const route = await resolveSmsRoute(normalized);
  if (route.error) return failure(route.error);

  const rateLimit = await applySendLimits({ ip: ip || 'unknown', deviceHash, country: normalized.country, userId, sessionToken });
  if (!rateLimit.allowed) return failure('OTP_RATE_LIMITED', rateLimit.retryAfterSeconds);

  const built = await buildInitialChallenge({
    normalized,
    route,
    purpose,
    userId,
    ip,
    deviceHash,
  });
  if (built.result) return built.result;

  const { challenge, code, requiresCaptcha, riskChallenge } = built.value;
  await recordAuthEvent({
    eventType: 'OTP_REQUESTED',
    target: maskPhone(normalized.e164),
    requestIp: ip,
    metadata: { provider: challenge.provider, purpose, country: normalized.country },
  });

  if (requiresCaptcha) {
    if (challenge.provider === 'firebase_phone') {
      return {
        success: false,
        requiresCaptcha: true,
        captchaType: 'firebase',
        challengeId: challenge.id,
        firebaseConfig,
      };
    }
    return {
      success: false,
      requiresCaptcha: true,
      captchaType: 'tencent',
      challengeId: challenge.id,
      captchaAppId: route.config.providers.tencent_captcha.appId,
      riskChallenge,
    };
  }

  const response = await startProviderSend({
    challenge: { ...challenge, ip },
    normalized,
    route,
    code,
  });
  if (!response.success) return response;
  return {
    success: true,
    challengeId: challenge.id,
    cooldown: 60,
    expiresInSeconds: 300,
  };
}

function validateOtpText(value) {
  const code = String(value || '').trim();
  return /^\d{6}$/.test(code) ? code : null;
}

export async function verifyPhoneOtp({
  phone,
  countryCode = '+86',
  code: inputCode,
  challengeId,
  purpose = 'login',
  userId = null,
  sessionToken = null,
  ip = null,
  deviceToken,
}) {
  let normalized;
  try {
    normalized = normalizePhone(phone, countryCode);
  } catch (error) {
    return failure(error.code || 'INVALID_PHONE');
  }
  const code = validateOtpText(inputCode);
  if (!code) return failure('OTP_INCORRECT');
  if (!['login', 'bind'].includes(purpose)) return failure('OTP_MISSING');
  if (purpose === 'bind' && !userId) return { ...failure('OTP_MISSING'), status: 401, message: '请先登录' };

  const deviceHash = hashDeviceToken(deviceToken);
  const limits = await applyVerifyLimits({ ip: ip || 'unknown', deviceHash, phone: normalized.e164, userId, sessionToken });
  if (!limits.allowed) return failure('OTP_RATE_LIMITED', limits.retryAfterSeconds);

  const result = await withTransaction(async (tx) => {
    const resolvedChallengeId = challengeId || (await smsRepo.findLatestSentOtpChallenge({
      phone: normalized.e164,
      purpose,
      userId,
      deviceHash,
    }, tx))?.id;
    if (!resolvedChallengeId) return { error: 'OTP_MISSING' };
    const challenge = await smsRepo.findOtpChallengeForUpdate(resolvedChallengeId, tx);
    if (!challenge
      || challenge.phone_e164 !== normalized.e164
      || challenge.purpose !== purpose
      || challenge.device_hash !== deviceHash
      || challenge.user_id !== (userId || null)) {
      return { error: 'OTP_MISSING' };
    }
    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await smsRepo.setOtpChallengeStatus({ id: challenge.id, status: 'expired', timestamp: nowIso() }, tx);
      return { error: 'OTP_EXPIRED' };
    }
    if (challenge.status !== 'sent') return { error: challenge.status === 'invalid' ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_MISSING' };
    if (Number(challenge.attempt_count) >= MAX_OTP_ATTEMPTS) {
      await smsRepo.setOtpChallengeStatus({ id: challenge.id, status: 'invalid', timestamp: nowIso() }, tx);
      return { error: 'OTP_ATTEMPTS_EXCEEDED' };
    }

    try {
      let verified = false;
      let providerUserIdExternal = null;
      if (challenge.provider === 'firebase_phone') {
        const provider = new FirebasePhoneProvider();
        const providerSession = decryptProviderSession({
          ciphertext: challenge.provider_session_ciphertext,
          nonce: challenge.provider_session_nonce,
          authTag: challenge.provider_session_auth_tag,
        });
        const externalIdentity = await provider.verifyOtp({ providerSession, code });
        if (externalIdentity.phone !== normalized.e164) {
          await smsRepo.setOtpChallengeStatus({ id: challenge.id, status: 'invalid', errorCode: 'FIREBASE_PHONE_MISMATCH', timestamp: nowIso() }, tx);
          return { error: 'OTP_INCORRECT' };
        }
        verified = true;
        providerUserIdExternal = externalIdentity.providerUserId;
      } else {
        const provider = PROVIDERS[challenge.provider]?.();
        if (!provider) return { error: 'SMS_PROVIDER_UNAVAILABLE' };
        const submittedHash = hashOtp(challenge.id, code);
        verified = await provider.verifyOtp({
          expectedHash: challenge.code_hash,
          submittedHash,
          compare: compareOtpHash,
        });
      }

      if (!verified) {
        const attempted = await smsRepo.incrementOtpAttempt({ id: challenge.id, maxAttempts: MAX_OTP_ATTEMPTS, timestamp: nowIso() }, tx);
        return { error: attempted?.status === 'invalid' ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INCORRECT' };
      }

      await smsRepo.verifyOtpChallenge(challenge.id, nowIso(), tx);
      await recordAuthEvent({
        eventType: 'OTP_VERIFIED',
        target: maskPhone(normalized.e164),
        requestIp: ip,
        metadata: { provider: challenge.provider, purpose },
        transaction: tx,
      });
      return {
        success: true,
        phone: normalized.e164,
        countryCode: normalized.callingCode,
        country: normalized.country,
        provider: challenge.provider,
        providerUserIdExternal,
      };
    } catch (error) {
      if (error.code === 'OTP_INCORRECT' || error.code === 'INVALID_CODE') {
        const attempted = await smsRepo.incrementOtpAttempt({ id: challenge.id, maxAttempts: MAX_OTP_ATTEMPTS, timestamp: nowIso() }, tx);
        return { error: attempted?.status === 'invalid' ? 'OTP_ATTEMPTS_EXCEEDED' : 'OTP_INCORRECT' };
      }
      if (error.code === 'OTP_EXPIRED') {
        await smsRepo.setOtpChallengeStatus({ id: challenge.id, status: 'expired', timestamp: nowIso() }, tx);
        return { error: 'OTP_EXPIRED' };
      }
      console.error('[sms/verify-provider]', { provider: challenge.provider, code: error.code || 'PROVIDER_ERROR' });
      return { error: error.code === 'OTP_EXPIRED' ? 'OTP_EXPIRED' : 'PROVIDER_UNAVAILABLE' };
    }
  });

  if (result.error) {
    await recordAuthEvent({
      eventType: 'OTP_FAILED',
      target: maskPhone(normalized.e164),
      requestIp: ip,
      metadata: { provider: 'phone', purpose, errorCode: result.error },
    });
    return failure(result.error);
  }
  return result;
}

export function smsPublicFailure(error) {
  return failure(error || 'SMS_INTERNAL_ERROR');
}
