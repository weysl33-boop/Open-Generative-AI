import 'server-only';

import { getSettingByKey } from './services/settings.js';
import { getProviderSecret } from './repositories/providers.js';

export const EMAIL_SMTP_PROVIDER = 'email_smtp';
export const QQ_EXMAIL_SMTP_HOST = 'smtp.exmail.qq.com';

const DEFAULT_CONFIG = Object.freeze({
  enabled: false,
  host: QQ_EXMAIL_SMTP_HOST,
  port: 465,
  secure: true,
  username: '',
  fromName: 'KoyoSIM',
});

export async function getEmailSmtpConfiguration() {
  let saved = null;
  try {
    const setting = await getSettingByKey('email_smtp');
    saved = setting?.value && typeof setting.value === 'object' ? setting.value : null;
  } catch {
    // Keep server environment defaults if the optional admin setting is absent.
  }

  const username = String(saved?.username || process.env.EMAIL_SMTP_USER || '').trim().toLowerCase();
  const fromName = String(saved?.fromName || process.env.EMAIL_SMTP_FROM_NAME || DEFAULT_CONFIG.fromName).trim().slice(0, 100);
  return {
    enabled: saved?.enabled === true,
    host: QQ_EXMAIL_SMTP_HOST,
    port: 465,
    secure: true,
    username,
    fromEmail: username,
    fromName,
  };
}

export async function getEmailSmtpPassword() {
  const envPassword = String(process.env.EMAIL_SMTP_PASSWORD || '').trim();
  if (envPassword) return envPassword;
  try {
    const value = await getProviderSecret(EMAIL_SMTP_PROVIDER, 'smtp_password');
    return typeof value === 'string' ? value.trim() || null : null;
  } catch {
    return null;
  }
}

export async function hasEmailSmtpPassword() {
  return Boolean(await getEmailSmtpPassword());
}
