// 微信/支付宝商户凭证的统一解析：环境变量优先，缺失时回落服务端密钥库。
// 独立成模块是因为下单服务与退款服务互相引用，放在任一侧都会形成循环依赖。
import { getStripeProvider } from './stripeProvider.js';
import { getWechatProvider, wechatCredentialReadiness } from './wechatProvider.js';
import { getAlipayProvider, alipayCredentialReadiness } from './alipayProvider.js';
import { readKeyOrPath } from './keyMaterial.js';
import { createStatusCache } from './statusCache.js';
import { readProviderSecret } from '../repositories/providers.js';

const KEY_SOURCE = 'providerCredentials';

// 记录"密钥库读不出来"的字段名，让上层能把它与"商户根本没配"区分开。
function secretReader(provider, unreadable) {
  return async (name) => {
    const result = await readProviderSecret(provider, name);
    if (result.status === 'error') unreadable.push(`${provider}:${name}`);
    return result.value;
  };
}

export async function getStripeWebhookSecret() {
  return (await readStripeSecret('webhook_secret', process.env.STRIPE_WEBHOOK_SECRET)).value;
}

export async function getStripeMerchantSecret() {
  return (await readStripeSecret('secret_key', process.env.STRIPE_SECRET_KEY)).value;
}

async function readStripeSecret(name, envValue) {
  if (envValue) return { value: envValue, unreadable: [] };
  const result = await readProviderSecret('stripe', name);
  return {
    value: result.value,
    unreadable: result.status === 'error' ? [`stripe:${name}`] : [],
  };
}

async function wechatMerchantCredentials() {
  const unreadable = [];
  const secret = secretReader('wechat', unreadable);
  const values = {
    appId: process.env.WECHAT_APP_ID || await secret('app_id'),
    mchId: process.env.WECHAT_MCH_ID || await secret('mch_id'),
    apiV3Key: process.env.WECHAT_API_V3_KEY || await secret('api_v3_key'),
    serialNo: process.env.WECHAT_CERT_SERIAL_NO
      || process.env.WECHAT_SERIAL_NO
      || await secret('serial_no'),
    privateKey: readKeyOrPath(process.env.WECHAT_PRIVATE_KEY, process.env.WECHAT_PRIVATE_KEY_PATH, KEY_SOURCE)
      || await secret('private_key'),
    publicKey: readKeyOrPath(process.env.WECHAT_PUBLIC_KEY, process.env.WECHAT_CERT_PATH, KEY_SOURCE)
      || await secret('public_key'),
  };
  return { values, unreadable };
}

async function alipayMerchantCredentials() {
  const unreadable = [];
  const secret = secretReader('alipay', unreadable);
  const values = {
    appId: process.env.ALIPAY_APP_ID || await secret('app_id'),
    privateKey: readKeyOrPath(process.env.ALIPAY_PRIVATE_KEY, process.env.ALIPAY_PRIVATE_KEY_PATH, KEY_SOURCE)
      || await secret('private_key'),
    publicKey: readKeyOrPath(process.env.ALIPAY_PUBLIC_KEY, process.env.ALIPAY_PUBLIC_KEY_PATH, KEY_SOURCE)
      || await secret('public_key'),
  };
  return { values, unreadable };
}

function withCredentialOptions(values, extra) {
  const options = { ...extra };
  for (const [key, value] of Object.entries(values)) if (value) options[key] = value;
  return options;
}

export async function resolveWechatProvider(extra = {}) {
  const { values } = await wechatMerchantCredentials();
  return getWechatProvider(withCredentialOptions(values, extra));
}

export async function resolveAlipayProvider(extra = {}) {
  const { values } = await alipayMerchantCredentials();
  return getAlipayProvider(withCredentialOptions(values, extra));
}

/**
 * 三个支付渠道的统一可用性判定：下单能调通、到账能验签，才算「可用」。
 * 页面展示与下单前校验必须共用它，否则前端能选中的渠道会在服务端悄悄退回模拟二维码。
 */
async function computePaymentChannelStatus() {
  const [wechat, alipay, stripeMerchant, stripeWebhook] = await Promise.all([
    wechatMerchantCredentials(),
    alipayMerchantCredentials(),
    readStripeSecret('secret_key', process.env.STRIPE_SECRET_KEY),
    readStripeSecret('webhook_secret', process.env.STRIPE_WEBHOOK_SECRET),
  ]);

  const stripeSecret = stripeMerchant.value;
  const stripeWebhookSecret = stripeWebhook.value;
  const wechatReadiness = wechatCredentialReadiness(wechat.values);
  const alipayReadiness = alipayCredentialReadiness(alipay.values);
  const stripeUnreadable = [...stripeMerchant.unreadable, ...stripeWebhook.unreadable];

  let stripeMode = process.env.STRIPE_MODE || (String(stripeSecret || '').startsWith('sk_test_') ? 'test' : 'live');
  let stripeError = null;
  try {
    stripeMode = getStripeProvider({ secret: stripeSecret }).mode;
  } catch (error) {
    stripeError = String(error.code || 'PROVIDER_NOT_CONFIGURED');
  }

  const stripeDisabled = process.env.STRIPE_ENABLED === 'false';
  const wechatDisabled = process.env.WECHAT_ENABLED === 'false';
  const alipayDisabled = process.env.ALIPAY_ENABLED === 'false';
  const stripeUsable = !stripeDisabled && !stripeError && Boolean(stripeWebhookSecret);

  return {
    stripe: {
      enabled: stripeUsable,
      mode: stripeMode,
      currencies: ['USD'],
      testModeOnly: stripeMode !== 'live' || process.env.STRIPE_LIVE_ENABLED !== 'true',
      missingCredentials: [
        ...(stripeError ? [stripeError] : []),
        ...(!stripeWebhookSecret ? ['STRIPE_WEBHOOK_SECRET'] : []),
      ],
      unreadable: stripeUnreadable,
      status: stripeDisabled ? 'disabled' : stripeUsable ? 'active' : stripeUnreadable.length ? 'unknown' : 'unavailable',
    },
    wechat: {
      enabled: !wechatDisabled && wechatReadiness.usable,
      currencies: ['CNY'],
      missingCredentials: wechatReadiness.missing,
      unreadable: wechat.unreadable,
      status: wechatDisabled ? 'disabled' : wechatReadiness.usable ? 'active' : wechat.unreadable.length ? 'unknown' : 'unavailable',
    },
    alipay: {
      enabled: !alipayDisabled && alipayReadiness.usable,
      currencies: ['CNY'],
      missingCredentials: alipayReadiness.missing,
      unreadable: alipay.unreadable,
      status: alipayDisabled ? 'disabled' : alipayReadiness.usable ? 'active' : alipay.unreadable.length ? 'unknown' : 'unavailable',
    },
  };
}

// 缓存只在三个渠道都"读得出来"时落地：密钥库抖动必须下一次请求就自愈。
function isSettledStatus(value) {
  return !(value.stripe.unreadable.length || value.wechat.unreadable.length || value.alipay.unreadable.length);
}

function channelCacheTtlMs() {
  const raw = Number(process.env.PAYMENT_CHANNEL_CACHE_TTL_MS);
  if (!Number.isFinite(raw)) return 30000;
  return Math.max(0, Math.min(raw, 300000));
}

const channelStatusCache = createStatusCache({
  compute: computePaymentChannelStatus,
  ttlMs: channelCacheTtlMs,
  cacheable: isSettledStatus,
});

export function invalidatePaymentChannelStatus() {
  channelStatusCache.invalidate();
}

export function paymentChannelStatus(options = {}) {
  return channelStatusCache.get(options);
}

export async function assertPaymentChannelUsable(provider) {
  const normalized = String(provider || '').toLowerCase();
  const channels = await paymentChannelStatus();
  const channel = channels[normalized];
  if (!channel) return { ok: false, status: 400, error: '不支持的支付渠道' };
  if (channel.status === 'disabled') return { ok: false, status: 503, error: `${normalized} 支付渠道已被运维关闭` };
  if (channel.status === 'unknown') {
    return { ok: false, status: 503, retryable: true, error: '支付服务暂时不可用，请稍后重试' };
  }
  if (!channel.enabled) {
    return { ok: false, status: 503, error: `${normalized} 支付渠道尚未完成配置，暂时无法下单` };
  }
  return { ok: true, channel };
}
