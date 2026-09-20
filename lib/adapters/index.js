import 'server-only';

import { getServerProviderApiKey } from '../services/providerSecrets.js';
import { BaseAdapter, PROVIDER_ERROR_CODES, NON_RETRYABLE_ERROR_CODES } from './BaseAdapter.js';
import { MuAPIAdapter } from './MuAPIAdapter.js';
import { KlingAdapter } from './KlingAdapter.js';
import { MiniMaxAdapter } from './MiniMaxAdapter.js';
import { AlibabaAdapter } from './AlibabaAdapter.js';
import { OpenAIAdapter } from './OpenAIAdapter.js';
import { GoogleAdapter } from './GoogleAdapter.js';
import { RunwayAdapter } from './RunwayAdapter.js';
import { LumaAdapter } from './LumaAdapter.js';

export {
  BaseAdapter,
  PROVIDER_ERROR_CODES,
  NON_RETRYABLE_ERROR_CODES,
  MuAPIAdapter,
  KlingAdapter,
  MiniMaxAdapter,
  AlibabaAdapter,
  OpenAIAdapter,
  GoogleAdapter,
  RunwayAdapter,
  LumaAdapter,
};

const ADAPTER_CLASSES = {
  muapi: MuAPIAdapter,
  kling: KlingAdapter,
  minimax: MiniMaxAdapter,
  alibaba: AlibabaAdapter,
  dashscope: AlibabaAdapter,
  openai: OpenAIAdapter,
  google: GoogleAdapter,
  runway: RunwayAdapter,
  luma: LumaAdapter,
};

/**
 * 供应商适配器工厂函数
 * 自动从安全的服务器端密钥库中读取凭据，绝不泄露给前端或日志
 */
export async function getProviderAdapter(providerId, options = {}) {
  const normId = String(providerId || 'muapi').toLowerCase().trim();
  const AdapterClass = ADAPTER_CLASSES[normId] || MuAPIAdapter;

  let apiKey = options.apiKey;
  if (!apiKey) {
    apiKey = await getServerProviderApiKey({ provider: normId });
  }

  // Fail closed: a vendor-direct adapter must carry its OWN credential.
  // The router already excludes credential-less channels (smartRouter hard filter),
  // so this branch only guards direct (non-routed) callers. Never swap a MuAPI key
  // onto a vendor adapter — that would send MuAPI's key to the vendor's host.

  return new AdapterClass({
    providerId: normId,
    apiKey,
    baseUrl: options.baseUrl,
    config: options.config || {},
  });
}
