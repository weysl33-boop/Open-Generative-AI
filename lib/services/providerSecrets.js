import 'server-only';

import { getProviderSecret } from '../repositories/providers.js';

const PROVIDER_ENV_KEYS = Object.freeze({
  muapi: { envNames: ['MUAPI_API_KEY', 'MUAPI_KEY'], secretName: 'api_key' },
  aliyun: { envNames: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY'], secretName: 'api_key' },
  // ai_providers / Adapter 用的是规范网关标识 alibaba，而密钥历史上按服务名 dashscope 配置；
  // 少了这一条，provider_id='alibaba' 的渠道会因为查不到 ALIBABA_API_KEY 被路由永久过滤掉。
  alibaba: { envNames: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY', 'ALIBABA_API_KEY'], secretName: 'api_key' },
  dashscope: { envNames: ['DASHSCOPE_API_KEY', 'ALIYUN_API_KEY', 'BAILIAN_API_KEY'], secretName: 'api_key' },
  minimax: { envNames: ['MINIMAX_API_KEY', 'MINIMAX_KEY'], secretName: 'api_key' },
  kling: { envNames: ['KLING_API_KEY', 'KLING_KEY', 'KLING_ACCESS_KEY'], secretName: 'api_key' },
  volcengine: { envNames: ['VOLCENGINE_API_KEY', 'ARK_API_KEY', 'VOLC_API_KEY'], secretName: 'api_key' },
  ark: { envNames: ['ARK_API_KEY', 'VOLCENGINE_API_KEY', 'VOLC_API_KEY'], secretName: 'api_key' },
  seedream: { envNames: ['ARK_API_KEY', 'VOLCENGINE_API_KEY', 'VOLC_API_KEY'], secretName: 'api_key' },
  bytedance: { envNames: ['VOLCENGINE_API_KEY', 'ARK_API_KEY', 'VOLC_API_KEY', 'BYTEDANCE_API_KEY'], secretName: 'api_key' },
  openai: { envNames: ['OPENAI_API_KEY', 'OPENAI_KEY'], secretName: 'api_key' },
  stripe: { envNames: ['STRIPE_SECRET_KEY'], secretName: 'secret_key' },
});

/**
 * Resolve a provider credential without ever accepting a browser-supplied
 * value. Environment secrets take precedence; encrypted PostgreSQL secrets
 * are the controlled fallback used by the admin rotation workflow.
 */
export async function getServerProviderApiKey({ provider = 'muapi' } = {}) {
  const norm = String(provider || 'muapi').toLowerCase();
  const config = PROVIDER_ENV_KEYS[norm] || { envNames: [`${norm.toUpperCase()}_API_KEY`], secretName: 'api_key' };
  
  for (const envName of config.envNames || []) {
    const val = String(process.env[envName] || '').trim();
    if (val) return val;
  }

  try {
    const storedValue = await getProviderSecret(norm, config.secretName);
    return typeof storedValue === 'string' ? storedValue.trim() || null : null;
  } catch {
    // A missing database/configuration must fail closed without exposing
    // encryption, connection, or schema details to the request path.
    return null;
  }
}
