import 'server-only';

import crypto from 'node:crypto';
import { randomId, withTransaction } from '../db/index.js';
import { sendEmailVerificationCode } from '../emailService.js';
import * as authRepo from '../repositories/auth.js';
import * as emailRepo from '../repositories/emailVerification.js';
import * as accountSettingsRepo from '../repositories/accountSettings.js';

const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function normalizeEmail(value) {
  const email = String(value || '').trim().toLowerCase();
  if (email.length > 128 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

function codeDigest(challengeId, code) {
  const secret = String(process.env.AUTH_VERIFICATION_CODE_SECRET || '');
  if (secret.length < 32) {
    throw Object.assign(new Error('Email verification is not configured'), { code: 'EMAIL_VERIFICATION_NOT_CONFIGURED' });
  }
  return crypto.createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
}

function digestMatches(left, right) {
  if (!/^[a-f0-9]{64}$/i.test(String(left || '')) || !/^[a-f0-9]{64}$/i.test(String(right || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(left, 'hex'), Buffer.from(right, 'hex'));
}

export async function requestEmailBinding({ userId, email: rawEmail, requestIp = null }) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { error: 'EMAIL_INVALID', message: '请输入有效的邮箱地址（最多 128 个字符）' };

  const settings = await accountSettingsRepo.getUserAccountSettings(userId);
  if (!settings) return { error: 'USER_NOT_FOUND', message: '用户账户不存在' };
  if (settings.email === email && settings.email_verified_at) {
    return { success: true, alreadyBound: true, email };
  }
  if (await emailRepo.emailOwnedByAnotherUser(email, userId)) {
    return { error: 'EMAIL_ALREADY_BOUND', message: '该邮箱已被其他账户绑定' };
  }

  const challengeId = randomId('emailv');
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');
  const codeHash = codeDigest(challengeId, code);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS).toISOString();
  await emailRepo.pruneEmailVerificationCodes(email);
  await emailRepo.createEmailVerificationCode({
    id: challengeId,
    email,
    codeHash,
    expiresAt,
    requestIp,
  });

  try {
    await sendEmailVerificationCode({ to: email, code });
  } catch (error) {
    await emailRepo.markEmailVerificationCodeUsed(challengeId).catch(() => {});
    return { error: error.code || 'EMAIL_DELIVERY_FAILED', message: error.message || '验证码邮件发送失败' };
  }

  return { success: true, verificationRequired: true, email, expiresInSeconds: Math.floor(CODE_TTL_MS / 1000) };
}

export async function confirmEmailBinding({ userId, email: rawEmail, code: rawCode, requestIp = null }) {
  const email = normalizeEmail(rawEmail);
  const code = String(rawCode || '').trim();
  if (!email || !/^\d{6}$/.test(code)) {
    return { error: 'EMAIL_CODE_INVALID', message: '邮箱或验证码格式不正确' };
  }

  try {
    return await withTransaction(async (tx) => {
      const challenge = await emailRepo.findLatestEmailVerificationCodeForUpdate(email, tx);
      if (!challenge || challenge.used_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
        return { error: 'EMAIL_CODE_EXPIRED', message: '验证码已失效，请重新发送' };
      }
      if (Number(challenge.attempts || 0) >= MAX_ATTEMPTS) {
        return { error: 'EMAIL_CODE_ATTEMPTS_EXCEEDED', message: '验证码尝试次数过多，请重新发送' };
      }
      if (!digestMatches(challenge.code, codeDigest(challenge.id, code))) {
        await emailRepo.incrementEmailVerificationAttempts(challenge.id, tx);
        return { error: 'EMAIL_CODE_INVALID', message: '验证码不正确' };
      }

      const bound = await emailRepo.bindVerifiedEmail({ userId, email }, tx);
      if (bound.error) return bound;
      await emailRepo.markEmailVerificationCodeUsed(challenge.id, tx);
      await authRepo.recordAuthEvent({
        eventType: 'EMAIL_BOUND',
        target: userId,
        requestIp,
        metadata: { email },
        transaction: tx,
      });
      return bound;
    });
  } catch (error) {
    if (error?.code === '23505') return { error: 'EMAIL_ALREADY_BOUND', message: '该邮箱已被其他账户绑定' };
    throw error;
  }
}
