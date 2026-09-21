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
import { VolcengineAdapter } from './VolcengineAdapter.js';

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
  VolcengineAdapter,
};

// 只登记「有可直连网关且有 Adapter」的供应商。
// 老目录里的 bytedance / vidu / pixverse 等是厂商标签，不是网关：它们的产品目前只能
// 经聚合网关调用，登记成供应商会让路由选中一条没有凭据也没有实现通道的死路。
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
  volcengine: VolcengineAdapter,
  ark: VolcengineAdapter,
  seedream: VolcengineAdapter,
};

/**
 * 供应商适配器工厂函数
 * 自动从安全的服务器端密钥库中读取凭据，绝不泄露给前端或日志
 *
 * Fail closed：供应商未知 / 无适配器 / 无凭据一律抛错。
 * 之前 `ADAPTER_CLASSES[normId] || MuAPIAdapter` 会把 bytedance、vidu、pixverse 等
 * 无适配器的供应商静默换成 MuAPI，再用 MuAPI 的 key 去调；上层看到的就是
 * "MuAPI 报 400"，实际是目录配错了。路由层已经过滤掉无凭据渠道，
 * 这里兜住的是绕过路由的直接调用方。
 */
export function hasProviderAdapter(providerId) {
  return Boolean(ADAPTER_CLASSES[String(providerId || '').toLowerCase().trim()]);
}

export function listAdapterProviderIds() {
  return Object.keys(ADAPTER_CLASSES);
}

export async function getProviderAdapter(providerId, options = {}) {
  const normId = String(providerId || '').toLowerCase().trim();
  if (!normId) {
    throw adapterError('', 'ADAPTER_NOT_CONFIGURED', '未指定供应商，拒绝回落到默认供应商');
  }

  const AdapterClass = ADAPTER_CLASSES[normId];
  if (!AdapterClass) {
    throw adapterError(normId, 'ADAPTER_NOT_CONFIGURED', `供应商 ${normId} 没有可用适配器，禁止替换为其他供应商`);
  }

  let apiKey = options.apiKey;
  if (!apiKey) {
    apiKey = await getServerProviderApiKey({ provider: normId });
  }
  if (!apiKey) {
    throw adapterError(normId, 'PROVIDER_CREDENTIAL_MISSING', `供应商 ${normId} 未配置服务端 API Key`);
  }

  return new AdapterClass({
    providerId: normId,
    apiKey,
    baseUrl: options.baseUrl,
    config: options.config || {},
  });
}

function adapterError(providerId, code, message) {
  const error = new Error(message);
  error.code = code;
  error.provider = providerId;
  error.isRetryable = false;
  return error;
}
