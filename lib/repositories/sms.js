import 'server-only';

import { execute, queryMany, queryOne, randomId } from '../db/index.js';

function one(transaction) {
  return transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
}

function many(transaction) {
  return transaction?.queryMany
    ? transaction.queryMany.bind(transaction)
    : async (...args) => (await queryMany(...args));
}

function write(transaction) {
  return transaction?.execute ? transaction.execute.bind(transaction) : execute;
}

export async function lockOtpPhone(phone, transaction) {
  if (!transaction?.query) throw new TypeError('OTP phone lock requires a transaction');
  return transaction.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`sms-send:${phone}`]);
}

export async function createOtpChallenge(challenge, transaction = null) {
  return one(transaction)(`
    INSERT INTO auth_usr.otp_challenges (
      id, phone_e164, country, provider, purpose, user_id, device_hash, ip_hash,
      code_hash, status, send_count, expires_at, created_at, updated_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$12)
    RETURNING id, phone_e164, country, provider, purpose, user_id, status, expires_at, created_at
  `, [
    challenge.id,
    challenge.phone,
    challenge.country,
    challenge.provider,
    challenge.purpose,
    challenge.userId || null,
    challenge.deviceHash,
    challenge.ipHash,
    challenge.codeHash || null,
    challenge.status || 'pending',
    challenge.expiresAt,
    challenge.createdAt,
  ]);
}

export async function purgeStaleOtpChallenges(olderThan) {
  return execute('DELETE FROM auth_usr.otp_challenges WHERE created_at < $1', [olderThan]);
}

export async function findOtpChallengeForUpdate(id, transaction = null) {
  return one(transaction)(`
    SELECT id, phone_e164, country, provider, purpose, user_id, device_hash, ip_hash,
      code_hash, provider_session_ciphertext, provider_session_nonce, provider_session_auth_tag,
      attempt_count, send_count, status, expires_at, verified_at, created_at, updated_at
    FROM auth_usr.otp_challenges WHERE id = $1 FOR UPDATE
  `, [id]);
}

export async function findLatestSentOtpChallenge({ phone, purpose, userId = null, deviceHash }, transaction = null) {
  return one(transaction)(`
    SELECT id FROM auth_usr.otp_challenges
    WHERE phone_e164 = $1 AND purpose = $2
      AND user_id IS NOT DISTINCT FROM $3
      AND device_hash = $4
      AND status = 'sent' AND expires_at > NOW()
    ORDER BY created_at DESC LIMIT 1
  `, [phone, purpose, userId, deviceHash]);
}

export async function countPhoneSends(phone, now, transaction = null) {
  return one(transaction)(`
    SELECT
      COUNT(*) FILTER (WHERE created_at > $2::timestamptz - INTERVAL '10 minutes')::int AS sends_10m,
      COUNT(*) FILTER (WHERE created_at > $2::timestamptz - INTERVAL '24 hours')::int AS sends_24h,
      MAX(created_at) FILTER (WHERE created_at > $2::timestamptz - INTERVAL '60 seconds') AS last_send_at
    FROM auth_usr.otp_challenges
    WHERE phone_e164 = $1 AND status <> 'cancelled'
  `, [phone, now]);
}

export async function countRecentSmsActivity({ ipHash, deviceHash, since }, transaction = null) {
  return one(transaction)(`
    SELECT
      COUNT(*) FILTER (WHERE ip_hash = $1)::int AS ip_count,
      COUNT(*) FILTER (WHERE device_hash = $2)::int AS device_count
    FROM auth_usr.otp_challenges
    WHERE created_at >= $3 AND status <> 'cancelled'
      AND (($1::text IS NOT NULL AND ip_hash = $1) OR ($2::text IS NOT NULL AND device_hash = $2))
  `, [ipHash || null, deviceHash || null, since]);
}

export async function cancelOtherPhoneChallenges({ phone, purpose, exceptId, timestamp }, transaction = null) {
  return write(transaction)(`
    UPDATE auth_usr.otp_challenges
    SET status = 'cancelled', updated_at = $4
    WHERE phone_e164 = $1 AND purpose = $2 AND id <> $3
      AND status IN ('captcha_pending', 'pending', 'sent')
  `, [phone, purpose, exceptId, timestamp]);
}

export async function setOtpChallengeCaptchaPending(id, captchaPending, transaction = null) {
  const status = captchaPending ? 'captcha_pending' : 'pending';
  return write(transaction)(
    'UPDATE auth_usr.otp_challenges SET status = $2, updated_at = NOW() WHERE id = $1',
    [id, status],
  );
}

export async function markOtpChallengeSent({ id, provider, codeHash = null, providerSession = null, timestamp }, transaction = null) {
  return write(transaction)(`
    UPDATE auth_usr.otp_challenges SET
      provider = $2,
      code_hash = $3,
      provider_session_ciphertext = $4,
      provider_session_nonce = $5,
      provider_session_auth_tag = $6,
      status = 'sent', send_count = send_count + 1, updated_at = $7
    WHERE id = $1
  `, [
    id,
    provider,
    codeHash,
    providerSession?.ciphertext || null,
    providerSession?.nonce || null,
    providerSession?.authTag || null,
    timestamp,
  ]);
}

export async function setOtpChallengeStatus({ id, status, errorCode = null, timestamp }, transaction = null) {
  return write(transaction)(`
    UPDATE auth_usr.otp_challenges
    SET status = $2, provider_error_code = $3, updated_at = $4
    WHERE id = $1
  `, [id, status, errorCode, timestamp]);
}

export async function incrementOtpAttempt({ id, maxAttempts = 5, timestamp }, transaction = null) {
  return one(transaction)(`
    UPDATE auth_usr.otp_challenges
    SET attempt_count = attempt_count + 1,
        status = CASE WHEN attempt_count + 1 >= $2 THEN 'invalid' ELSE status END,
        updated_at = $3
    WHERE id = $1
    RETURNING attempt_count, status
  `, [id, maxAttempts, timestamp]);
}

export async function verifyOtpChallenge(id, timestamp, transaction = null) {
  return write(transaction)(`
    UPDATE auth_usr.otp_challenges
    SET status = 'verified', verified_at = $2, updated_at = $2
    WHERE id = $1 AND status = 'sent'
  `, [id, timestamp]);
}

export async function recordSmsDelivery({ provider, phoneMasked, country, status, errorCode = null, latencyMs = null, challengeId = null, timestamp }) {
  return execute(`
    INSERT INTO auth_usr.sms_delivery_logs
      (id, challenge_id, provider, masked_phone, country, status, error_code, latency_ms, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
  `, [randomId('smslog'), challengeId, provider, phoneMasked, country, status, errorCode, latencyMs, timestamp]);
}

export async function getSmsProviderStats(since) {
  return many(null)(`
    SELECT provider,
      COUNT(*)::int AS attempts,
      COUNT(*) FILTER (WHERE status = 'success')::int AS successes,
      COUNT(*) FILTER (WHERE status = 'failed')::int AS failures,
      ROUND(AVG(latency_ms) FILTER (WHERE status = 'success'))::int AS average_latency_ms,
      MAX(created_at) AS last_attempt_at,
      (ARRAY_AGG(error_code ORDER BY created_at DESC) FILTER (WHERE error_code IS NOT NULL))[1] AS last_error
    FROM auth_usr.sms_delivery_logs
    WHERE created_at >= $1
    GROUP BY provider
  `, [since]);
}

export async function listRecentSmsDeliveryLogs(limit = 50) {
  return many(null)(`
    SELECT provider, masked_phone, country, status, error_code, latency_ms, created_at
    FROM auth_usr.sms_delivery_logs
    ORDER BY created_at DESC LIMIT $1
  `, [Math.max(1, Math.min(100, Number(limit) || 50))]);
}
