import 'server-only';

import { nowIso, withTransaction } from './db/index.js';
import { verifyAdminPassword } from './admin/authz.js';
import { logAudit } from './admin/audit.js';
import { maskPhone, normalizePhone } from './auth/phone.js';
import { getSmsConfiguration, getSmsProviderCredentials } from './smsConfig.js';
import { saveSystemSetting } from './services/settings.js';
import { createOtp, hashRateLimitSubject } from './smsCrypto.js';
import * as providerRepo from './repositories/providers.js';
import * as smsRepo from './repositories/sms.js';
import { consumeRateLimit } from './security/requestGuard.js';
import { AliyunSmsProvider, FirebasePhoneProvider, TencentSmsProvider } from './smsProviders.js';

const SECRET_FIELDS = Object.freeze({
  tencent_sms: ['secret_id', 'secret_key'],
  aliyun_sms: ['access_key_id', 'access_key_secret'],
  tencent_captcha: ['secret_id', 'secret_key', 'app_secret_key'],
});

const PROVIDER_DETAILS = Object.freeze({
  tencent_sms: { name: '腾讯云短信', region: 'China +86', sms: true },
  aliyun_sms: { name: '阿里云短信', region: 'China +86 fallback', sms: true },
  firebase_phone: { name: 'Firebase Phone Auth', region: 'International', sms: false },
});

function configuredFrom({ provider, config, credentials }) {
  if (provider === 'tencent_sms') {
    return Boolean(credentials.secret_id && credentials.secret_key
      && config.sdkAppId && config.signName && config.templateId);
  }
  if (provider === 'aliyun_sms') {
    return Boolean(credentials.access_key_id && credentials.access_key_secret
      && config.signName && config.templateId);
  }
  if (provider === 'firebase_phone') {
    return Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
  }
  return Boolean(config.appId && credentials.secret_id && credentials.secret_key && credentials.app_secret_key);
}

function providerSecrets(provider, credentials) {
  const names = SECRET_FIELDS[provider] || [];
  return Object.fromEntries(names.map((name) => [name, Boolean(credentials[name])]));
}

function normalizeConfigInput(body, current) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { error: '配置格式无效' };
  const providers = {};
  const schemas = {
    tencent_sms: { sdkAppId: 64, signName: 128, templateId: 64 },
    aliyun_sms: { signName: 128, templateId: 64 },
    firebase_phone: { apiKey: 256, authDomain: 256, projectId: 128, appId: 256 },
    tencent_captcha: { appId: 32 },
  };

  for (const [provider, allowedFields] of Object.entries(schemas)) {
    const incoming = body.providers?.[provider];
    const previous = current.providers[provider] || {};
    const next = { enabled: typeof incoming?.enabled === 'boolean' ? incoming.enabled : previous.enabled !== false };
    for (const [field, maxLength] of Object.entries(allowedFields)) {
      const raw = incoming?.[field];
      const value = raw === undefined ? previous[field] || '' : typeof raw === 'string' ? raw.trim() : null;
      if (value === null || value.length > maxLength) return { error: `${provider}.${field} 格式无效` };
      next[field] = value;
    }
    providers[provider] = next;
  }

  const primary = body.routing?.china?.primary;
  const fallback = body.routing?.china?.fallback;
  if (!['tencent_sms', 'aliyun_sms'].includes(primary)) return { error: '中国短信主线路只能选择腾讯云或阿里云' };
  if (fallback !== null && !['tencent_sms', 'aliyun_sms'].includes(fallback)) return { error: '中国短信备用线路无效' };
  if (fallback === primary) return { error: '短信主线路与备用线路不能相同' };
  if (providers[primary].enabled === false) return { error: '请先启用所选主线路' };

  return {
    value: {
      providers,
      routing: {
        china: { primary, fallback },
        international: { primary: 'firebase_phone' },
      },
    },
  };
}

export async function getSmsAdminOverview() {
  const [config, stats, healthRows, recentLogs, ...credentials] = await Promise.all([
    getSmsConfiguration(),
    smsRepo.getSmsProviderStats(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
    providerRepo.getLatestHealthChecks(),
    smsRepo.listRecentSmsDeliveryLogs(20),
    getSmsProviderCredentials('tencent_sms'),
    getSmsProviderCredentials('aliyun_sms'),
    getSmsProviderCredentials('tencent_captcha'),
  ]);

  const secretMap = {
    tencent_sms: credentials[0],
    aliyun_sms: credentials[1],
    tencent_captcha: credentials[2],
  };
  const statsByProvider = new Map(stats.map((row) => [row.provider, row]));
  const healthByProvider = new Map(healthRows
    .filter((row) => String(row.provider).startsWith('sms:'))
    .map((row) => [row.provider.replace(/^sms:/, ''), row]));

  const providers = Object.entries(PROVIDER_DETAILS).map(([id, details]) => {
    const providerConfig = config.providers[id] || {};
    const credentialsForProvider = secretMap[id] || {};
    const isConfigured = configuredFrom({ provider: id, config: providerConfig, credentials: credentialsForProvider });
    const health = healthByProvider.get(id) || null;
    const recent = statsByProvider.get(id) || null;
    const enabled = providerConfig.enabled !== false;
    const priority = config.routing.china.primary === id ? 'primary'
      : config.routing.china.fallback === id ? 'fallback'
        : id === 'firebase_phone' ? 'primary' : null;
    return {
      id,
      ...details,
      enabled,
      configured: isConfigured,
      status: !enabled ? 'disabled' : !isConfigured ? 'unavailable' : health?.status || 'not_checked',
      lastHealthCheck: health?.checked_at || null,
      lastHealthLatencyMs: health?.latency_ms ?? null,
      lastHealthError: health?.error_code || null,
      priority,
      metrics24h: {
        attempts: Number(recent?.attempts || 0),
        successes: Number(recent?.successes || 0),
        failures: Number(recent?.failures || 0),
        successRate: recent?.attempts ? Math.round((Number(recent.successes) / Number(recent.attempts)) * 10000) / 100 : null,
        averageLatencyMs: recent?.average_latency_ms == null ? null : Number(recent.average_latency_ms),
        lastAttemptAt: recent?.last_attempt_at || null,
        lastError: recent?.last_error || null,
      },
      secretConfigured: providerSecrets(id, credentialsForProvider),
    };
  });

  const captchaCredentials = secretMap.tencent_captcha;
  const captchaConfigured = configuredFrom({
    provider: 'tencent_captcha',
    config: config.providers.tencent_captcha || {},
    credentials: captchaCredentials,
  });

  return {
    routes: config.routing,
    providers,
    riskCaptcha: {
      id: 'tencent_captcha',
      enabled: config.providers.tencent_captcha?.enabled !== false,
      configured: captchaConfigured,
      status: config.providers.tencent_captcha?.enabled === false ? 'disabled' : captchaConfigured ? 'configured' : 'unavailable',
      appId: config.providers.tencent_captcha?.appId || '',
      secretConfigured: providerSecrets('tencent_captcha', captchaCredentials),
      trigger: '连续或高频 +86 短信请求时才挑战；低风险请求不触发。',
    },
    settings: {
      providers: config.providers,
    },
    recentLogs,
  };
}

export async function saveSmsAdminConfiguration({ actor, body, requestId }) {
  const current = await getSmsConfiguration();
  const normalized = normalizeConfigInput(body, current);
  if (normalized.error) return normalized;
  const saved = await saveSystemSetting({
    actor,
    key: 'sms_routing',
    value: normalized.value,
    visibility: 'private',
    requestId,
  });
  return saved.error ? { error: saved.error } : { success: true };
}

export async function saveSmsProviderSecrets({ actor, adminPassword, secrets, requestId }) {
  if (!(await verifyAdminPassword(actor.id, adminPassword))) return { error: '管理员密码验证失败' };
  if (!secrets || typeof secrets !== 'object' || Array.isArray(secrets)) return { error: '密钥配置格式无效' };

  const entries = [];
  for (const [provider, values] of Object.entries(secrets)) {
    const allowedNames = SECRET_FIELDS[provider];
    if (!allowedNames || !values || typeof values !== 'object' || Array.isArray(values)) return { error: '短信 Provider 或密钥字段无效' };
    for (const [name, value] of Object.entries(values)) {
      if (!allowedNames.includes(name)) return { error: '短信 Provider 或密钥字段无效' };
      const cleanValue = typeof value === 'string' ? value.trim() : '';
      if (cleanValue && (cleanValue.length < 4 || cleanValue.length > 8192)) return { error: `${name} 长度无效` };
      if (cleanValue) entries.push({ provider, name, value: cleanValue });
    }
  }
  if (entries.length === 0) return { error: '没有填写新的密钥' };

  const timestamp = nowIso();
  await withTransaction(async (tx) => {
    for (const item of entries) {
      await providerRepo.saveProviderSecret({ provider: item.provider, name: item.name, secretValue: item.value, transaction: tx });
    }
    await logAudit({
      actor,
      action: 'sms.providers.rotate_secrets',
      targetType: 'sms_provider',
      targetId: entries.map(({ provider, name }) => `${provider}:${name}`).join(','),
      riskLevel: 'high',
      after: { updatedNames: entries.map(({ provider, name }) => `${provider}:${name}`), updatedAt: timestamp },
      requestId,
      transaction: tx,
    });
  });
  return { success: true, count: entries.length };
}

function getProviderInstance(provider) {
  if (provider === 'tencent_sms') return new TencentSmsProvider();
  if (provider === 'aliyun_sms') return new AliyunSmsProvider();
  if (provider === 'firebase_phone') return new FirebasePhoneProvider();
  return null;
}

export async function runSmsProviderHealthCheck({ actor, provider, requestId }) {
  const instance = getProviderInstance(provider);
  if (!instance) return { error: '不支持该 Provider 健康检查' };
  const started = Date.now();
  let result;
  try {
    result = await instance.healthCheck();
  } catch (error) {
    result = { status: 'unavailable', errorCode: error.code || 'PROVIDER_HEALTH_CHECK_FAILED' };
  }
  const latencyMs = Date.now() - started;
  await providerRepo.recordHealthCheck({
    provider: `sms:${provider}`,
    status: result.status,
    latencyMs,
    errorCode: result.errorCode || null,
    details: { actorId: actor.id },
  });
  await logAudit({
    actor,
    action: 'sms.providers.health_check',
    targetType: 'sms_provider',
    targetId: provider,
    riskLevel: 'low',
    after: { status: result.status, latencyMs, errorCode: result.errorCode || null },
    requestId,
  });
  return { provider, status: result.status, errorCode: result.errorCode || null, latencyMs };
}

export async function sendSmsProviderTest({ actor, provider, phone, ip, requestId }) {
  if (!['tencent_sms', 'aliyun_sms'].includes(provider)) return { error: '测试短信仅支持中国短信 Provider' };
  let normalized;
  try {
    normalized = normalizePhone(phone, '+86');
  } catch {
    return { error: '请输入有效的中国大陆手机号' };
  }
  if (normalized.callingCode !== '+86') return { error: '测试短信仅支持中国大陆 +86 手机号' };

  const ipLimit = await consumeRateLimit({
    scope: 'admin_sms_test_ip',
    subject: hashRateLimitSubject('admin-test-ip', ip || 'unknown'),
    limit: 5,
    windowMs: 60 * 60 * 1000,
  });
  const phoneLimit = await consumeRateLimit({
    scope: 'admin_sms_test_phone',
    subject: hashRateLimitSubject('admin-test-phone', normalized.e164),
    limit: 1,
    windowMs: 60 * 1000,
  });
  if (!ipLimit.allowed || !phoneLimit.allowed) return { error: '测试短信发送过于频繁，请稍后重试', status: 429 };

  const config = await getSmsConfiguration();
  if (!config.providers[provider]?.enabled) return { error: '该短信 Provider 当前已禁用', status: 409 };
  const instance = getProviderInstance(provider);
  const started = Date.now();
  try {
    await instance.sendOtp({ phone: normalized, code: createOtp() });
    await smsRepo.recordSmsDelivery({
      provider,
      phoneMasked: maskPhone(normalized.e164),
      country: normalized.country,
      status: 'success',
      latencyMs: Date.now() - started,
      timestamp: nowIso(),
    });
    await logAudit({
      actor,
      action: 'sms.providers.test_sms',
      targetType: 'sms_provider',
      targetId: provider,
      riskLevel: 'medium',
      after: { phoneMasked: maskPhone(normalized.e164), status: 'accepted' },
      requestId,
    });
    return { success: true, message: '供应商已接受测试短信请求，最终送达以运营商回执为准。' };
  } catch (error) {
    const errorCode = error.code || 'PROVIDER_SERVICE_ERROR';
    await smsRepo.recordSmsDelivery({
      provider,
      phoneMasked: maskPhone(normalized.e164),
      country: normalized.country,
      status: 'failed',
      errorCode,
      latencyMs: Date.now() - started,
      timestamp: nowIso(),
    });
    console.error('[sms/admin-test]', { provider, code: errorCode });
    return { error: '测试短信发送失败，请检查 Provider 配置或查看后台错误代码', status: 503 };
  }
}
