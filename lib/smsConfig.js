import 'server-only';

import { getSettingByKey } from './services/settings.js';
import { getProviderSecret } from './repositories/providers.js';

const DEFAULT_CONFIG = Object.freeze({
  providers: {
    tencent_sms: { enabled: true },
    aliyun_sms: { enabled: true },
    firebase_phone: { enabled: true },
    tencent_captcha: { enabled: true },
  },
  routing: {
    china: { primary: 'tencent_sms', fallback: 'aliyun_sms' },
    international: { primary: 'firebase_phone' },
  },
});

function validProvider(provider, allowed) {
  return allowed.includes(provider) ? provider : allowed[0];
}

export async function getSmsConfiguration() {
  let saved = null;
  try {
    const setting = await getSettingByKey('sms_routing');
    saved = setting?.value && typeof setting.value === 'object' ? setting.value : null;
  } catch {
    // Environment defaults remain available when the optional admin setting is absent.
  }

  const config = {
    providers: {},
    routing: {
      china: {
        primary: validProvider(saved?.routing?.china?.primary || process.env.SMS_CHINA_PRIMARY, ['tencent_sms', 'aliyun_sms']),
        fallback: saved?.routing?.china?.fallback === null
          ? null
          : validProvider(saved?.routing?.china?.fallback || process.env.SMS_CHINA_FALLBACK, ['aliyun_sms', 'tencent_sms']),
      },
      international: { primary: 'firebase_phone' },
    },
  };

  for (const provider of Object.keys(DEFAULT_CONFIG.providers)) {
    config.providers[provider] = {
      enabled: saved?.providers?.[provider]?.enabled !== false,
    };
  }

  const envDefaults = {
    tencent_sms: {
      sdkAppId: process.env.TENCENT_SMS_SDK_APP_ID,
      signName: process.env.TENCENT_SMS_SIGN_NAME,
      templateId: process.env.TENCENT_SMS_TEMPLATE_ID,
    },
    aliyun_sms: {
      signName: process.env.ALIYUN_SMS_SIGN_NAME,
      templateId: process.env.ALIYUN_SMS_TEMPLATE_CODE,
    },
    firebase_phone: {
      apiKey: process.env.FIREBASE_WEB_API_KEY,
      authDomain: process.env.FIREBASE_AUTH_DOMAIN,
      projectId: process.env.FIREBASE_PROJECT_ID,
      appId: process.env.FIREBASE_APP_ID,
    },
    tencent_captcha: {
      appId: process.env.TENCENT_CAPTCHA_APP_ID,
    },
  };

  for (const [provider, values] of Object.entries(envDefaults)) {
    config.providers[provider] = {
      ...config.providers[provider],
      ...Object.fromEntries(Object.entries(values).map(([key, value]) => [
        key,
        String(saved?.providers?.[provider]?.[key] || value || '').trim(),
      ])),
    };
  }

  return config;
}

const SECRET_ENVIRONMENT_KEYS = Object.freeze({
  tencent_sms: {
    secret_id: 'TENCENT_SMS_SECRET_ID',
    secret_key: 'TENCENT_SMS_SECRET_KEY',
  },
  aliyun_sms: {
    access_key_id: 'ALIYUN_SMS_ACCESS_KEY_ID',
    access_key_secret: 'ALIYUN_SMS_ACCESS_KEY_SECRET',
  },
  tencent_captcha: {
    secret_id: 'TENCENT_CAPTCHA_SECRET_ID',
    secret_key: 'TENCENT_CAPTCHA_SECRET_KEY',
    app_secret_key: 'TENCENT_CAPTCHA_APP_SECRET_KEY',
  },
});

export async function getSmsSecret(provider, name) {
  const envKey = SECRET_ENVIRONMENT_KEYS[provider]?.[name];
  if (envKey && String(process.env[envKey] || '').trim()) {
    return String(process.env[envKey]).trim();
  }
  try {
    const stored = await getProviderSecret(provider, name);
    return typeof stored === 'string' ? stored.trim() || null : null;
  } catch {
    return null;
  }
}

export async function getSmsProviderCredentials(provider) {
  const names = provider === 'tencent_sms'
    ? ['secret_id', 'secret_key']
    : provider === 'aliyun_sms'
      ? ['access_key_id', 'access_key_secret']
      : provider === 'tencent_captcha'
        ? ['secret_id', 'secret_key', 'app_secret_key']
        : [];
  const entries = await Promise.all(names.map(async (name) => [name, await getSmsSecret(provider, name)]));
  return Object.fromEntries(entries);
}

export async function getFirebaseWebConfig() {
  const config = await getSmsConfiguration();
  const value = config.providers.firebase_phone;
  if (!value.apiKey || !value.authDomain || !value.projectId || !value.appId) return null;
  return {
    apiKey: value.apiKey,
    authDomain: value.authDomain,
    projectId: value.projectId,
    appId: value.appId,
  };
}
