import 'server-only';

import { getSmsConfiguration } from './smsConfig.js';
import { AliyunSmsProvider, FirebasePhoneProvider, TencentSmsProvider } from './smsProviders.js';

const PROVIDERS = Object.freeze({
  tencent_sms: () => new TencentSmsProvider(),
  aliyun_sms: () => new AliyunSmsProvider(),
  firebase_phone: () => new FirebasePhoneProvider(),
});

export async function resolveSmsRoute(phone) {
  const config = await getSmsConfiguration();
  const isChina = phone.callingCode === '+86';
  const route = isChina ? config.routing.china : config.routing.international;
  const primaryId = route.primary;
  const fallbackId = isChina ? route.fallback : null;

  if (!config.providers[primaryId]?.enabled) {
    return { error: 'SMS_PROVIDER_DISABLED', status: 503 };
  }
  const primaryFactory = PROVIDERS[primaryId];
  if (!primaryFactory) return { error: 'SMS_PROVIDER_UNAVAILABLE', status: 503 };

  let fallback = null;
  if (fallbackId && fallbackId !== primaryId && config.providers[fallbackId]?.enabled && PROVIDERS[fallbackId]) {
    fallback = { id: fallbackId, provider: PROVIDERS[fallbackId]() };
  }

  return {
    country: isChina ? 'CN' : phone.country,
    provider: { id: primaryId, provider: primaryFactory() },
    fallback,
    config,
  };
}
