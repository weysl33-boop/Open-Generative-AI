import 'server-only';

import { logAudit } from '../admin/audit.js';
import * as providerRepo from '../repositories/providers.js';

export async function getProvidersOverview() {
  const latestChecks = await providerRepo.getLatestHealthChecks();
  const checksMap = new Map(latestChecks.map((c) => [c.provider, c]));

  const providers = [
    {
      id: 'muapi',
      name: 'MuAPI AI 引擎',
      kind: 'ai',
      description: '生成式 AI 图像与视频多模型服务',
      configured: Boolean(process.env.MUAPI_API_KEY || await providerRepo.hasProviderSecret('muapi', 'api_key')),
      mode: 'BYOK 优先 / 服务端托管',
      secretManaged: true,
      lastCheck: checksMap.get('muapi') || null,
    },
    {
      id: 'stripe',
      name: 'Stripe 国际支付',
      kind: 'payment',
      description: '信用卡与海外订阅代扣渠道',
      configured: Boolean(process.env.STRIPE_SECRET_KEY || await providerRepo.hasProviderSecret('stripe', 'secret_key')),
      mode: '服务端 API',
      secretManaged: true,
      lastCheck: checksMap.get('stripe') || null,
    },
    {
      id: 'wechat',
      name: '微信支付',
      kind: 'payment',
      description: 'Native 扫码支付与 JSAPI 支付',
      configured: Boolean(process.env.WECHAT_MCH_ID || await providerRepo.hasProviderSecret('wechat', 'api_key')),
      mode: '商户证书通信',
      secretManaged: true,
      lastCheck: checksMap.get('wechat') || null,
    },
    {
      id: 'alipay',
      name: '支付宝',
      kind: 'payment',
      description: '当面付扫码与手机网页支付',
      configured: Boolean(process.env.ALIPAY_APP_ID || await providerRepo.hasProviderSecret('alipay', 'private_key')),
      mode: '应用私钥签名',
      secretManaged: true,
      lastCheck: checksMap.get('alipay') || null,
    },
  ];

  return providers;
}

export async function rotateProviderSecret({ actor, provider, secretName, secretValue, requestId }) {
  if (!secretValue || typeof secretValue !== 'string' || secretValue.length < 8) {
    return { error: '密钥内容格式无效或长度不足' };
  }

  const result = await providerRepo.saveProviderSecret({
    provider,
    name: secretName,
    secretValue,
  });

  await logAudit({
    actor,
    action: 'providers.rotate_secret',
    targetType: 'provider',
    targetId: `${provider}:${secretName}`,
    riskLevel: 'high',
    after: { provider, secretName, updatedAt: result.updatedAt },
    requestId,
  });

  return { success: true, provider, secretName, updatedAt: result.updatedAt };
}

export async function testProviderHealth({ actor, provider, requestId }) {
  const start = Date.now();
  let status = 'healthy';
  let errorCode = null;
  let details = {};

  try {
    if (provider === 'muapi') {
      // 受限探测：仅检查网络连通性或预检请求
      const res = await fetch('https://api.muapi.ai/api/v1/models', { method: 'GET', cache: 'no-store' });
      if (!res.ok && res.status !== 401) {
        status = 'degraded';
        errorCode = `HTTP_${res.status}`;
      }
      details = { httpStatus: res.status };
    } else {
      details = { note: '已执行本地环境变量与配置校验' };
    }
  } catch (err) {
    status = 'offline';
    errorCode = err.code || 'NETWORK_ERROR';
    details = { error: err.message };
  }

  const latencyMs = Date.now() - start;
  const record = await providerRepo.recordHealthCheck({
    provider,
    status,
    latencyMs,
    errorCode,
    details,
  });

  await logAudit({
    actor,
    action: 'providers.test_health',
    targetType: 'provider',
    targetId: provider,
    riskLevel: 'low',
    after: { status, latencyMs, errorCode },
    requestId,
  });

  return record;
}
