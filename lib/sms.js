import crypto from 'node:crypto';
import { nowIso, queryOne, execute } from './db/index.js';

const SMS_PROVIDER = process.env.SMS_PROVIDER || 'mock'; // 'mock' | 'aliyun' | 'tencent' | 'twilio'

/**
 * 生成 6 位纯数字安全验证码
 */
export function generateVerificationCode() {
  return String(crypto.randomInt(100000, 999999));
}

/**
 * 规范化中国大陆及国际手机号
 */
export function normalizePhoneNumber(phone, countryCode = '+86') {
  const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').trim();
  const cleanCode = String(countryCode || '+86').trim();
  return {
    rawPhone: cleanPhone,
    countryCode: cleanCode.startsWith('+') ? cleanCode : `+${cleanCode}`,
    fullPhone: cleanPhone.startsWith('+') ? cleanPhone : `${cleanCode}${cleanPhone}`
  };
}

/**
 * 验证手机号格式
 */
export function validatePhoneNumber(phone, countryCode = '+86') {
  const { rawPhone } = normalizePhoneNumber(phone, countryCode);
  if (!rawPhone) return '手机号不能为空';
  if (countryCode === '+86' || countryCode === '86') {
    if (!/^1[3-9]\d{9}$/.test(rawPhone)) {
      return '请输入有效的 11 位手机号码';
    }
  } else {
    if (rawPhone.length < 5 || rawPhone.length > 20) {
      return '请输入有效的国际手机号码';
    }
  }
  return null;
}

/**
 * 发送短信验证码核心函数（带 60 秒限频与防刷）
 */
export async function sendSmsVerificationCode({ phone, countryCode = '+86', type = 'login', ip = null }) {
  const formatError = validatePhoneNumber(phone, countryCode);
  if (formatError) return { error: formatError };

  const { fullPhone, rawPhone } = normalizePhoneNumber(phone, countryCode);
  const now = new Date();

  // 1. 检查 60 秒内是否已经发送过（防刷保护）
  const recent = await queryOne(`
    SELECT created_at FROM auth_verification_codes
    WHERE target = $1 AND type = $2 AND created_at > $3
    ORDER BY created_at DESC LIMIT 1
  `, [fullPhone, type, new Date(now.getTime() - 60000).toISOString()]);

  if (recent) {
    return { error: '请求过于频繁，请在 60 秒后重试' };
  }

  // 2. 生成 6 位随机验证码，10 分钟有效
  const code = generateVerificationCode();
  const expiresAt = new Date(now.getTime() + 10 * 60000).toISOString();
  const id = `cod_${crypto.randomBytes(12).toString('hex')}`;

  await execute(`
    INSERT INTO auth_verification_codes (id, target, code, type, attempts, expires_at, created_at)
    VALUES ($1, $2, $3, $4, 0, $5, $6)
  `, [id, fullPhone, code, type, expiresAt, nowIso()]);

  // 3. 按照 SMS Provider 发送短信
  let devNotice = null;

  if (SMS_PROVIDER === 'aliyun') {
    if (!process.env.ALIYUN_SMS_ACCESS_KEY_ID || !process.env.ALIYUN_SMS_ACCESS_KEY_SECRET) {
      console.warn('[SMS] 未配置 ALIYUN_SMS_ACCESS_KEY_ID / SECRET');
      devNotice = '阿里云短信密钥尚未在服务器配置（需设置 ALIYUN_SMS_ACCESS_KEY_ID 与 SECRET）';
    } else {
      console.log(`[SMS-Aliyun] 正在向 ${fullPhone} 发送验证码`);
    }
  } else if (SMS_PROVIDER === 'tencent') {
    if (!process.env.TENCENT_SMS_SECRET_ID || !process.env.TENCENT_SMS_SECRET_KEY) {
      console.warn('[SMS] 未配置 TENCENT_SMS_SECRET_ID / KEY');
      devNotice = '腾讯云短信通道尚未配置密钥（需设置 TENCENT_SMS_SECRET_ID 与 KEY）';
    }
  } else if (SMS_PROVIDER === 'twilio') {
    if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
      console.warn('[SMS] 未配置 TWILIO_ACCOUNT_SID / AUTH_TOKEN');
      devNotice = 'Twilio 短信通道尚未配置密钥（需设置 TWILIO_ACCOUNT_SID 与 AUTH_TOKEN）';
    }
  } else {
    console.log(`[SMS-Mock] 手机: ${fullPhone} | 验证码: [ ${code} ] (10分钟内有效)`);
  }

  return {
    success: true,
    target: fullPhone,
    expiresInSeconds: 600,
    devCode: process.env.NODE_ENV !== 'production' || SMS_PROVIDER === 'mock' ? code : undefined,
    notice: devNotice || '验证码已发送'
  };
}

/**
 * 校验手机验证码
 */
export async function verifySmsCode({ phone, countryCode = '+86', code, type = 'login' }) {
  const { fullPhone } = normalizePhoneNumber(phone, countryCode);
  const cleanCode = String(code || '').trim();

  if (!cleanCode || cleanCode.length !== 6) {
    return { error: '请输入 6 位有效验证码' };
  }

  const record = await queryOne(`
    SELECT id, code, attempts, expires_at, used_at FROM auth_verification_codes
    WHERE target = $1 AND type = $2 AND used_at IS NULL
    ORDER BY created_at DESC LIMIT 1
  `, [fullPhone, type]);

  if (!record) {
    return { error: '未找到有效验证码，请重新获取' };
  }

  if (new Date(record.expires_at).getTime() < Date.now()) {
    return { error: '验证码已过期，请重新获取' };
  }

  if (record.attempts >= 5) {
    return { error: '验证码尝试次数过多，请重新获取' };
  }

  if (record.code !== cleanCode) {
    await execute('UPDATE auth_verification_codes SET attempts = attempts + 1 WHERE id = $1', [record.id]);
    return { error: '验证码不正确，请重新输入' };
  }

  // 校验成功，标记使用
  await execute('UPDATE auth_verification_codes SET used_at = $1 WHERE id = $2', [nowIso(), record.id]);
  return { success: true, target: fullPhone };
}
