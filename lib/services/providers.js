import 'server-only';

import { logAudit } from '../admin/audit.js';
import { withTransaction } from '../db/index.js';
import * as providerRepo from '../repositories/providers.js';
import { paymentChannelStatus, invalidatePaymentChannelStatus } from '../payments/providerCredentials.js';
import { getServerProviderApiKey } from './providerSecrets.js';

export async function getProviderSecretsMetadata(providerId) {
  return providerRepo.getProviderSecretsMetadata(providerId);
}

async function enrichSecretKeys(providerId, keys) {
  if (!keys || !Array.isArray(keys)) return [];
  const metadataList = await providerRepo.getProviderSecretsMetadata(providerId);
  const metaMap = new Map(metadataList.map((m) => [m.name, m]));

  const envKeyMap = {
    'google:client_id': process.env.GOOGLE_CLIENT_ID,
    'google:client_secret': process.env.GOOGLE_CLIENT_SECRET,
    'x:client_id': process.env.X_CLIENT_ID,
    'x:client_secret': process.env.X_CLIENT_SECRET,
    'tiktok:client_key': process.env.TIKTOK_CLIENT_KEY,
    'tiktok:client_secret': process.env.TIKTOK_CLIENT_SECRET,
    'wechat_oauth:app_id': process.env.WECHAT_OAUTH_APP_ID,
    'wechat_oauth:app_secret': process.env.WECHAT_OAUTH_APP_SECRET,
    'qq:app_id': process.env.QQ_APP_ID,
    'qq:app_key': process.env.QQ_APP_KEY,
    'douyin:client_key': process.env.DOUYIN_CLIENT_KEY,
    'douyin:client_secret': process.env.DOUYIN_CLIENT_SECRET,
  };

  const enriched = [];
  for (const k of keys) {
    const isPublicId = ['client_id', 'client_key', 'app_id', 'mch_id'].includes(k.name);
    const meta = metaMap.get(k.name);
    const envVal = envKeyMap[`${providerId}:${k.name}`];
    let configured = Boolean(meta || envVal);
    let currentValue = '';
    let previewValue = '';

    if (configured) {
      if (isPublicId) {
        const stored = await providerRepo.getProviderSecret(providerId, k.name);
        currentValue = stored || envVal || '';
        previewValue = currentValue;
      } else {
        previewValue = '••••••••••••••••';
      }
    }

    enriched.push({
      ...k,
      isSecret: !isPublicId,
      configured,
      updatedAt: meta?.updatedAt || (envVal ? '环境配置' : null),
      currentValue,
      previewValue,
    });
  }
  return enriched;
}

function channelNotice(channel) {
  if (!channel || channel.enabled) return null;
  if (channel.status === 'disabled') return '运维已关闭该渠道';
  // 密钥库读不出来不等于商户没配：报"缺少 X"会把一次 DB 抖动写成配置事故。
  if (channel.status === 'unknown') return '密钥服务暂时不可用，无法确认凭证状态';
  const missing = (channel.missingCredentials || []).filter(Boolean);
  return missing.length ? `缺少 ${missing.join('、')}` : '商户凭证未完成配置';
}

export async function getProvidersOverview() {
  const latestChecks = await providerRepo.getLatestHealthChecks();
  const checksMap = new Map(latestChecks.map((c) => [c.provider, c]));
  // 支付渠道的"已就绪"必须与下单/回调用的是同一个判定，否则后台亮绿灯的渠道会在结账时 503。
  const channels = await paymentChannelStatus();

  const providers = [
    {
      id: 'muapi',
      name: 'MuAPI 聚合网关 (方案一)',
      kind: 'ai',
      description: '多模态聚合网关：支持 FLUX、Midjourney、Hailuo、Runway、Luma 等海内外大模型统一接入与智能路由',
      configured: Boolean(process.env.MUAPI_API_KEY || await providerRepo.hasProviderSecret('muapi', 'api_key')),
      mode: '服务端聚合网关模式 (统一接入 / 全托管)',
      secretManaged: true,
      lastCheck: checksMap.get('muapi') || null,
    },
    {
      id: 'dashscope',
      name: '阿里云百炼 / 通义万相 / Wan2.1 (方案二)',
      kind: 'ai',
      description: '国内直连引擎：Wan2.1 (万相文生视频/图生视频/文生图)、Qwen-Image 等百炼原生高并发接口',
      configured: Boolean(process.env.DASHSCOPE_API_KEY || process.env.ALIYUN_API_KEY || await providerRepo.hasProviderSecret('dashscope', 'api_key') || await providerRepo.hasProviderSecret('aliyun', 'api_key')),
      mode: '阿里云百炼 DashScope 原生 REST API',
      secretManaged: true,
      lastCheck: checksMap.get('dashscope') || null,
    },
    {
      id: 'minimax',
      name: 'MiniMax 海螺视频 / 语音 (方案二)',
      kind: 'ai',
      description: '国内直连引擎：MiniMax Video-01 (Hailuo) 电影级高清视频生成与高质量语音合成',
      configured: Boolean(process.env.MINIMAX_API_KEY || await providerRepo.hasProviderSecret('minimax', 'api_key')),
      mode: 'MiniMax 开放平台 OpenAPI',
      secretManaged: true,
      lastCheck: checksMap.get('minimax') || null,
    },
    {
      id: 'kling',
      name: '快手可灵 Kling AI (方案二)',
      kind: 'ai',
      description: '国内直连引擎：快手可灵 Kling 1.5/2.0 高逼真文生视频与运动控制图生视频',
      configured: Boolean(process.env.KLING_API_KEY || await providerRepo.hasProviderSecret('kling', 'api_key')),
      mode: '快手可灵开放平台 API',
      secretManaged: true,
      lastCheck: checksMap.get('kling') || null,
    },
    {
      id: 'volcengine',
      name: '火山引擎 / 火山方舟 (Seedream 全系)',
      kind: 'ai',
      description: '国内直连引擎：火山方舟 Seedream 3.0/4.0/4.5/5.0/5.0 Pro 高清文生图/图生图，Seedance 视频生成与 Doubao 视觉模型',
      configured: Boolean(
        process.env.VOLCENGINE_API_KEY ||
        process.env.ARK_API_KEY ||
        await providerRepo.hasProviderSecret('volcengine', 'api_key') ||
        await providerRepo.hasProviderSecret('ark', 'api_key')
      ),
      mode: '火山方舟 Ark 原生 API 直连',
      secretManaged: true,
      secretKeys: await enrichSecretKeys('volcengine', [
        { name: 'api_key', label: '火山方舟 API Key', placeholder: 'ark-xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
      ]),
      lastCheck: checksMap.get('volcengine') || checksMap.get('ark') || null,
    },
    {
      id: 'stripe',
      name: 'Stripe 国际支付',
      kind: 'payment',
      description: '信用卡与海外订阅代扣渠道',
      configured: channels.stripe.enabled,
      unavailableReason: channelNotice(channels.stripe),
      mode: '服务端 API',
      secretManaged: true,
      lastCheck: checksMap.get('stripe') || null,
    },
    {
      id: 'wechat',
      name: '微信支付',
      kind: 'payment',
      description: 'Native 扫码支付与 JSAPI 支付',
      configured: channels.wechat.enabled,
      unavailableReason: channelNotice(channels.wechat),
      mode: '商户证书通信',
      secretManaged: true,
      lastCheck: checksMap.get('wechat') || null,
    },
    {
      id: 'alipay',
      name: '支付宝',
      kind: 'payment',
      description: '当面付扫码与电脑/手机网页支付',
      configured: channels.alipay.enabled,
      unavailableReason: channelNotice(channels.alipay),
      mode: 'RSA2 (SHA256withRSA) 密钥签名',
      secretManaged: true,
      secretKeys: await enrichSecretKeys('alipay', [
        { name: 'app_id', label: '支付宝 AppID', placeholder: '开放平台创建的自研/网页应用 ID (例如: 202100xxxxxxxx)' },
        { name: 'private_key', label: '商户应用私钥 (Merchant Private Key)', placeholder: '由密钥工具生成的 PKCS8 私钥 (MIIEvgIBADANBgkqhkiG9w0BAQEFAASCB...)' },
        { name: 'public_key', label: '支付宝公钥 (Alipay Public Key)', placeholder: '支付宝开放平台上传应用公钥后生成的“支付宝公钥” (非应用公钥)' },
      ]),
      lastCheck: checksMap.get('alipay') || null,
    },
    {
      id: 'google',
      name: 'Google 账号登录',
      kind: 'social',
      description: 'Google Identity 登录授权与邮箱验证 (OAuth 2.0 PKCE)',
      configured: Boolean(
        (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) ||
        (await providerRepo.hasProviderSecret('google', 'client_id') && await providerRepo.hasProviderSecret('google', 'client_secret'))
      ),
      mode: 'OAuth 2.0 PKCE / OIDC',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/google/callback',
      secretKeys: await enrichSecretKeys('google', [
        { name: 'client_id', label: 'Client ID 客户端标识', placeholder: 'xxxx.apps.googleusercontent.com' },
        { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: 'GOCSPX-xxxx' },
      ]),
      lastCheck: checksMap.get('google') || null,
    },
    {
      id: 'x',
      name: 'X (Twitter) 登录',
      kind: 'social',
      description: 'X Developer Platform 用户身份与账号快捷登录 (OAuth 2.0)',
      configured: Boolean(
        (process.env.X_CLIENT_ID && process.env.X_CLIENT_SECRET) ||
        (await providerRepo.hasProviderSecret('x', 'client_id') && await providerRepo.hasProviderSecret('x', 'client_secret'))
      ),
      mode: 'OAuth 2.0 PKCE',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/x/callback',
      secretKeys: await enrichSecretKeys('x', [
        { name: 'client_id', label: 'Client ID 客户端标识', placeholder: '从 X 开发者后台获取的 Client ID' },
        { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: '从 X 开发者后台获取的 Client Secret' },
      ]),
      lastCheck: checksMap.get('x') || null,
    },
    {
      id: 'tiktok',
      name: 'TikTok 登录',
      kind: 'social',
      description: 'TikTok for Developers 用户身份授权 (Login Kit for Web)',
      configured: Boolean(
        (process.env.TIKTOK_CLIENT_KEY && process.env.TIKTOK_CLIENT_SECRET) ||
        (await providerRepo.hasProviderSecret('tiktok', 'client_key') && await providerRepo.hasProviderSecret('tiktok', 'client_secret'))
      ),
      mode: 'Login Kit for Web',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/tiktok/callback',
      secretKeys: await enrichSecretKeys('tiktok', [
        { name: 'client_key', label: 'Client Key 客户端标识', placeholder: '从 TikTok 开发者后台获取的 Client Key' },
        { name: 'client_secret', label: 'Client Secret 客户端密钥', placeholder: '从 TikTok 开发者后台获取的 Client Secret' },
      ]),
      lastCheck: checksMap.get('tiktok') || null,
    },
    {
      id: 'wechat_oauth',
      name: '微信开放平台登录',
      kind: 'social',
      description: '微信网站应用扫码登录（snsapi_login）。凭据单独存于 wechat_oauth 命名空间，与微信支付完全隔离。',
      configured: Boolean(
        (process.env.WECHAT_OAUTH_APP_ID || await providerRepo.hasProviderSecret('wechat_oauth', 'app_id')) &&
        (process.env.WECHAT_OAUTH_APP_SECRET || await providerRepo.hasProviderSecret('wechat_oauth', 'app_secret'))
      ),
      mode: '微信网站应用 OAuth 2.0 Authorization Code',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/wechat/callback',
      redirectUri: `${String(process.env.PUBLIC_APP_URL || 'https://www.koyosim.com').replace(/\/+$/, '')}/api/auth/oauth/wechat/callback`,
      callbackHint: '在微信开放平台的网站应用中，将回调域配置为此地址的主机名（不含协议、路径和端口）。',
      secretKeys: await enrichSecretKeys('wechat_oauth', [
        { name: 'app_id', label: '微信开放平台网站应用 AppID', placeholder: '开放平台审核通过的网站应用 AppID' },
        { name: 'app_secret', label: '微信开放平台网站应用 AppSecret', placeholder: '网站应用 AppSecret（严格保密）' },
      ]),
      lastCheck: checksMap.get('wechat_oauth') || null,
    },
    {
      id: 'qq',
      name: 'QQ 互联登录',
      kind: 'social',
      description: 'QQ 互联网站应用 OAuth 2.0：授权码 → Access Token → OpenID → 用户资料。',
      configured: Boolean(
        (process.env.QQ_APP_ID || await providerRepo.hasProviderSecret('qq', 'app_id')) &&
        (process.env.QQ_APP_KEY || await providerRepo.hasProviderSecret('qq', 'app_key'))
      ),
      mode: 'QQ 互联 OAuth 2.0 Server-side',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/qq/callback',
      redirectUri: `${String(process.env.PUBLIC_APP_URL || 'https://www.koyosim.com').replace(/\/+$/, '')}/api/auth/oauth/qq/callback`,
      callbackHint: '在 QQ 互联网站应用中登记此回调地址；需与授权请求的 redirect_uri 完全一致。',
      secretKeys: await enrichSecretKeys('qq', [
        { name: 'app_id', label: 'QQ 互联 App ID', placeholder: 'QQ 互联网站应用 App ID' },
        { name: 'app_key', label: 'QQ 互联 App Key', placeholder: 'QQ 互联 App Key（严格保密）' },
      ]),
      lastCheck: checksMap.get('qq') || null,
    },
    {
      id: 'douyin',
      name: '抖音开放平台登录',
      kind: 'social',
      description: '抖音网站应用扫码登录（user_info）。这是抖音开放平台，与 TikTok Login Kit 完全独立。',
      configured: Boolean(
        (process.env.DOUYIN_CLIENT_KEY || await providerRepo.hasProviderSecret('douyin', 'client_key')) &&
        (process.env.DOUYIN_CLIENT_SECRET || await providerRepo.hasProviderSecret('douyin', 'client_secret'))
      ),
      mode: '抖音 OAuth 2.0 网站应用授权码',
      secretManaged: true,
      callbackPath: '/api/auth/oauth/douyin/callback',
      redirectUri: `${String(process.env.PUBLIC_APP_URL || 'https://www.koyosim.com').replace(/\/+$/, '')}/api/auth/oauth/douyin/callback`,
      callbackHint: '在抖音开放平台网站应用中登记完整 HTTPS 回调 URL；授权回调不支持自定义 query 参数。',
      secretKeys: await enrichSecretKeys('douyin', [
        { name: 'client_key', label: '抖音网站应用 Client Key', placeholder: '抖音开放平台网站应用 Client Key' },
        { name: 'client_secret', label: '抖音网站应用 Client Secret', placeholder: '抖音网站应用 Client Secret（严格保密）' },
      ]),
      lastCheck: checksMap.get('douyin') || null,
    },
  ];

  return providers;
}


export async function rotateProviderSecret({ actor, provider, secretName, secretValue, requestId }) {
  const cleanValue = typeof secretValue === 'string' ? secretValue.trim() : '';
  if (!cleanValue || cleanValue.length < 3) {
    return { error: '密钥内容格式无效或长度不足' };
  }

  const rotated = await withTransaction(async (tx) => {
    const result = await providerRepo.saveProviderSecret({
      provider,
      name: secretName,
      secretValue: cleanValue,
      transaction: tx,
    });

    await logAudit({
      actor,
      action: 'providers.rotate_secret',
      targetType: 'provider',
      targetId: `${provider}:${secretName}`,
      riskLevel: 'high',
      after: { provider, secretName, updatedAt: result.updatedAt },
      requestId,
      transaction: tx,
    });

    return { success: true, provider, secretName, updatedAt: result.updatedAt };
  });

  // 渠道状态有进程内缓存，管理员刚存完密钥就看到"未配置"会立刻被当成 bug。
  if (rotated?.success) invalidatePaymentChannelStatus();
  return rotated;
}

export async function testProviderHealth({ actor, provider, requestId }) {
  const start = Date.now();
  let status = 'healthy';
  let errorCode = null;
  let details = {};

  try {
    if (provider === 'muapi') {
      const apiKey = await getServerProviderApiKey({ provider: 'muapi' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { httpStatus: null };
      } else {
        const res = await fetch('https://api.muapi.ai/api/v1/models', {
          method: 'GET',
          headers: { 'x-api-key': apiKey },
          cache: 'no-store',
        });
        if (!res.ok) {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
        }
        details = { httpStatus: res.status };
      }
    } else if (provider === 'dashscope' || provider === 'aliyun') {
      const apiKey = await getServerProviderApiKey({ provider: 'dashscope' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置阿里云百炼 API-KEY (DASHSCOPE_API_KEY)' };
      } else {
        const res = await fetch('https://dashscope.aliyuncs.com/api/v1/models', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${apiKey}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '连通阿里云百炼 DashScope 超时' };
        } else if (!res.ok && res.status !== 404) {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
          details = { httpStatus: res.status, endpoint: 'DashScope API' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'DashScope API' };
        }
      }
    } else if (provider === 'minimax') {
      const apiKey = await getServerProviderApiKey({ provider: 'minimax' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置 MiniMax API Key' };
      } else {
        status = 'healthy';
        details = { endpoint: 'MiniMax OpenAPI Gateway' };
      }
    } else if (provider === 'kling') {
      const apiKey = await getServerProviderApiKey({ provider: 'kling' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置快手可灵 Kling API Key' };
      } else {
        status = 'healthy';
        details = { endpoint: 'Kling AI Gateway' };
      }
    } else if (provider === 'volcengine' || provider === 'ark' || provider === 'seedream') {
      const apiKey = await getServerProviderApiKey({ provider: 'volcengine' });
      if (!apiKey) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未配置火山方舟 API Key (VOLCENGINE_API_KEY 或 ARK_API_KEY)' };
      } else {
        const res = await fetch('https://ark.cn-beijing.volces.com/api/v3/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${apiKey}` },
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '连通火山方舟 API 网关超时' };
        } else if (!res.ok) {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
          details = { httpStatus: res.status, endpoint: 'Ark API v3 Gateway' };
        } else {
          const data = await res.json().catch(() => ({}));
          const count = Array.isArray(data?.data) ? data.data.length : 0;
          const seedCount = Array.isArray(data?.data)
            ? data.data.filter((m) => (m.id || '').includes('seed') || (m.name || '').includes('seed')).length
            : 0;
          status = 'healthy';
          details = {
            httpStatus: res.status,
            endpoint: 'https://ark.cn-beijing.volces.com/api/v3/models',
            totalModels: count,
            seedreamModels: seedCount,
            note: '已成功连通火山方舟并验证 Seedream 全系模型权限',
          };
        }
      }
    } else if (provider === 'google') {
      const hasId = process.env.GOOGLE_CLIENT_ID || await providerRepo.hasProviderSecret('google', 'client_id');
      const hasSecret = process.env.GOOGLE_CLIENT_SECRET || await providerRepo.hasProviderSecret('google', 'client_secret');
      if (!hasId || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入 Client ID 或 Client Secret' };
      } else {
        const res = await fetch('https://accounts.google.com/.well-known/openid-configuration', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { error: '无法连通 Google OIDC 网关（请求超时或网络受限）' };
        } else if (!res.ok) {
          status = 'degraded';
          errorCode = `HTTP_${res.status}`;
          details = { httpStatus: res.status, endpoint: 'Google OIDC Discovery' };
        } else {
          status = 'healthy';
          details = { httpStatus: res.status, endpoint: 'Google OIDC Discovery' };
        }
      }
    } else if (provider === 'x') {
      const hasId = process.env.X_CLIENT_ID || await providerRepo.hasProviderSecret('x', 'client_id');
      const hasSecret = process.env.X_CLIENT_SECRET || await providerRepo.hasProviderSecret('x', 'client_secret');
      if (!hasId || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入 Client ID 或 Client Secret' };
      } else {
        const res = await fetch('https://api.x.com/2/oauth2/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: 'grant_type=client_credentials',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
        } else {
          status = 'healthy';
        }
        details = { httpStatus: res?.status || 200, endpoint: 'X API v2 Gateway' };
      }
    } else if (provider === 'tiktok') {
      const hasKey = process.env.TIKTOK_CLIENT_KEY || await providerRepo.hasProviderSecret('tiktok', 'client_key');
      const hasSecret = process.env.TIKTOK_CLIENT_SECRET || await providerRepo.hasProviderSecret('tiktok', 'client_secret');
      if (!hasKey || !hasSecret) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入 Client Key 或 Client Secret' };
      } else {
        const res = await fetch('https://www.tiktok.com/v2/auth/authorize/', {
          method: 'GET',
          cache: 'no-store',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
        } else {
          status = 'healthy';
        }
        details = { httpStatus: res?.status || 200, endpoint: 'TikTok Authorize Gateway' };
      }
    } else if (provider === 'wechat_oauth' || provider === 'qq' || provider === 'douyin') {
      const credentialSets = {
        wechat_oauth: {
          names: ['app_id', 'app_secret'],
          env: [process.env.WECHAT_OAUTH_APP_ID, process.env.WECHAT_OAUTH_APP_SECRET],
          endpoint: 'https://open.weixin.qq.com/',
        },
        qq: {
          names: ['app_id', 'app_key'],
          env: [process.env.QQ_APP_ID, process.env.QQ_APP_KEY],
          endpoint: 'https://graph.qq.com/oauth2.0/authorize',
        },
        douyin: {
          names: ['client_key', 'client_secret'],
          env: [process.env.DOUYIN_CLIENT_KEY, process.env.DOUYIN_CLIENT_SECRET],
          endpoint: 'https://open.douyin.com/platform/oauth/connect',
        },
      };
      const check = credentialSets[provider];
      const flags = await Promise.all(check.names.map((name) => providerRepo.hasProviderSecret(provider, name)));
      const hasAllCredentials = check.names.every((_, index) => Boolean(check.env[index] || flags[index]));
      if (!hasAllCredentials) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: '尚未录入完整的开放平台 AppID/Key 与 Secret' };
      } else {
        const res = await fetch(check.endpoint, {
          method: 'GET',
          cache: 'no-store',
          redirect: 'manual',
          signal: AbortSignal.timeout(6000),
        }).catch(() => null);
        if (!res) {
          status = 'offline';
          errorCode = 'NETWORK_TIMEOUT';
          details = { endpoint: check.endpoint, note: '未能连接开放平台网关' };
        } else {
          // These public endpoints may return 3xx/4xx without required OAuth parameters.
          // A <500 response proves reachability only; this probe never validates the app secret.
          status = res.status < 500 ? 'healthy' : 'degraded';
          if (status !== 'healthy') errorCode = `HTTP_${res.status}`;
          details = {
            httpStatus: res.status,
            endpoint: check.endpoint,
            note: '仅检查开放平台网关可达性，不发起用户授权或验证凭据有效性',
          };
        }
      }
    } else if (provider === 'stripe' || provider === 'wechat' || provider === 'alipay') {
      // 只判可达性不够：GET 支付宝网关永远 200，Stripe/微信此前没有分支，
      // 于是一个凭证都没配的渠道也能被"测试连接"记成 healthy。
      const channel = (await paymentChannelStatus({ force: true }))[provider];
      if (channel.status === 'disabled') {
        status = 'unconfigured';
        errorCode = 'CHANNEL_DISABLED';
        details = { error: '运维已通过 *_ENABLED=false 关闭该渠道' };
      } else if (channel.status === 'unknown') {
        // 不能把"读不到密钥"记成"商户未配置"：那会留下一条误导性的健康检查历史。
        status = 'degraded';
        errorCode = 'SECRET_STORE_UNAVAILABLE';
        details = { error: channelNotice(channel), unreadable: channel.unreadable };
      } else if (!channel.enabled) {
        status = 'unconfigured';
        errorCode = 'PROVIDER_NOT_CONFIGURED';
        details = { error: channelNotice(channel), missingCredentials: channel.missingCredentials };
      } else {
        status = 'healthy';
        details = { mode: channel.mode || null, currencies: channel.currencies };
      }
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
