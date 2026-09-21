import 'server-only';

import { execute, nowIso, randomId, withTransaction } from '../db/index.js';
import * as authRepo from './auth.js';

export async function bindVerifiedPhoneIdentity({
  userId,
  phone,
  phoneE164,
  countryCode,
  verificationProvider,
  providerUserIdExternal = null,
  ip = null,
}) {
  const cleanPhone = String(phone || '').trim();
  const canonicalPhone = String(phoneE164 || '').trim();
  if (!userId || !cleanPhone || !/^\+[1-9]\d{5,14}$/.test(canonicalPhone)) {
    return { error: 'INVALID_PHONE', message: '请输入有效的手机号码' };
  }

  try {
    return await withTransaction(async (transaction) => {
      await transaction.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`phone-identity:${canonicalPhone}`]);
      const account = await authRepo.findPhoneAccount(canonicalPhone, transaction);
      if (account && account.user_id !== userId) {
        return { error: 'PHONE_ALREADY_BOUND', message: '该手机号码已绑定其他账户' };
      }

      const owner = await authRepo.findUserByPhoneForUpdate(cleanPhone, transaction);
      if (owner && owner.id !== userId) {
        return { error: 'PHONE_ALREADY_BOUND', message: '该手机号码已绑定其他账户' };
      }

      const user = await authRepo.findUserForUpdate(userId, transaction);
      if (!user) return { error: 'USER_NOT_FOUND', message: '用户账户不存在' };
      if (user.status === 'suspended') return { error: 'ACCOUNT_SUSPENDED', message: '账户当前不可用' };

      const timestamp = nowIso();
      await transaction.execute(
        'UPDATE users SET phone = $1, phone_country_code = $2, phone_verified_at = $3, updated_at = $3 WHERE id = $4',
        [cleanPhone, countryCode, timestamp, userId],
      );
      if (!account) {
        await authRepo.insertPhoneAccount({
          id: randomId('acc_ph'),
          userId,
          providerUserId: canonicalPhone,
          timestamp,
        }, transaction);
      }
      if (providerUserIdExternal) {
        await transaction.execute(`
          UPDATE auth_accounts
          SET profile_json = COALESCE(profile_json, '{}'::jsonb) || $1::jsonb,
              updated_at = $2
          WHERE user_id = $3 AND provider = 'phone' AND provider_user_id = $4
        `, [JSON.stringify({ verification_provider: verificationProvider, provider_user_id_external: providerUserIdExternal }), timestamp, userId, canonicalPhone]);
      }
      await authRepo.recordAuthEvent({
        eventType: 'PHONE_BOUND',
        target: userId,
        requestIp: ip,
        metadata: { provider: verificationProvider || 'phone' },
        transaction,
      });
      return { success: true, userId, phone: cleanPhone, phoneE164: canonicalPhone, countryCode };
    });
  } catch (error) {
    if (error?.code === '23505') return { error: 'PHONE_ALREADY_BOUND', message: '该手机号码已绑定其他账户' };
    throw error;
  }
}

export async function recordVerifiedPhoneLogin({ userId, phoneE164, verificationProvider, providerUserIdExternal = null, ip = null }) {
  if (providerUserIdExternal) {
    await execute(`
      UPDATE auth_accounts
      SET profile_json = COALESCE(profile_json, '{}'::jsonb) || $1::jsonb,
          updated_at = $2,
          last_login_at = $2
      WHERE user_id = $3 AND provider = 'phone' AND provider_user_id = $4
    `, [JSON.stringify({ verification_provider: verificationProvider, provider_user_id_external: providerUserIdExternal }), nowIso(), userId, phoneE164]);
  }
  await authRepo.recordAuthEvent({
    eventType: 'LOGIN_SUCCESS',
    target: userId,
    requestIp: ip,
    metadata: { provider: verificationProvider || 'phone' },
  });
}
