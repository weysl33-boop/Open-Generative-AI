import crypto from 'node:crypto';
import { getProviderAdapter, hasProviderAdapter } from '../adapters/index.js';

function parseInput(creation) {
  if (creation?.input_summary_json && typeof creation.input_summary_json === 'object') return creation.input_summary_json;
  try { return JSON.parse(creation?.input_summary_json || '{}'); } catch { return {}; }
}

function buildRequest({ creation, providerModelId }) {
  const input = parseInput(creation);
  const endpoint = providerModelId || input.endpoint || creation?.model;
  const parameters = { ...(input.parameters && typeof input.parameters === 'object' ? input.parameters : input) };
  // 商业平台默认不产出可见水印；调用方显式给了值就尊重调用方。
  if (parameters.watermark === undefined) parameters.watermark = false;
  return {
    endpoint,
    parameters,
    prompt: input.prompt || parameters.prompt || '',
  };
}

export function createMockGenerationProvider({ outcome = 'succeeded', resultUrl = 'https://mock.invalid/generated/result.png' } = {}) {
  return {
    providerId: 'mock',
    async submit({ creation }) {
      if (outcome === 'failed') {
        throw Object.assign(new Error('模拟供应商返回失败'), { code: 'MOCK_PROVIDER_FAILED' });
      }
      return {
        status: 'succeeded',
        providerRequestId: `mock_${crypto.randomBytes(8).toString('hex')}`,
        resultUrl,
        actualCostUsd: 0,
        metadata: { provider: 'mock', model: creation.model },
      };
    },
    async poll() {
      return { status: 'processing', resultUrl: null, actualCostUsd: 0 };
    },
    // 一次调用跑完的快捷入口，供测试与同步型供应商使用。
    async generate(input) {
      const submitted = await this.submit(input);
      if (submitted.resultUrl) return submitted;
      return this.poll({ ...input, providerRequestId: submitted.providerRequestId });
    },
  };
}

/**
 * 把 Adapter 的 createTask / getTask 契约拆成 submit + poll 两步，
 * 让「提交」和「等待」可以落在不同的 worker 心跳里：一条 3 分钟的视频不会
 * 被单次 HTTP 超时困住，也不会在恢复时重复提交向上游再要一次配额。
 * 供应商差异只存在于 Adapter 内部，这里不出现任何供应商名称分支。
 */
export function createAdapterGenerationProvider({ adapter, providerModelId }) {
  return {
    providerId: adapter.providerId,
    async submit({ creation, signal }) {
      const { endpoint, parameters, prompt } = buildRequest({ creation, providerModelId });
      const submitted = await adapter.createTask({ providerModelId: endpoint, prompt, parameters, signal });
      const metadata = { provider: adapter.providerId, endpoint, ...(submitted?.metadata || {}) };

      if (submitted?.resultUrl) {
        return {
          status: 'succeeded',
          providerRequestId: submitted.providerRequestId || null,
          resultUrl: submitted.resultUrl,
          actualCostUsd: Number(submitted.actualCostUsd || 0),
          metadata,
        };
      }
      if (!submitted?.providerRequestId) {
        throw Object.assign(new Error(`供应商 ${adapter.providerId} 未返回任务标识，无法跟踪生成结果`), {
          code: 'PROVIDER_RESPONSE_INVALID',
        });
      }
      return {
        status: 'processing',
        providerRequestId: submitted.providerRequestId,
        resultUrl: null,
        actualCostUsd: Number(submitted.actualCostUsd || 0),
        metadata,
      };
    },
    async poll({ providerRequestId, signal }) {
      const snapshot = await adapter.getTask(providerRequestId, { signal });
      const status = snapshot?.status || 'processing';
      return {
        status,
        providerRequestId,
        resultUrl: status === 'succeeded' ? (snapshot?.resultUrl || null) : null,
        actualCostUsd: Number.isFinite(Number(snapshot?.actualCostUsd)) ? Number(snapshot.actualCostUsd) : 0,
        error: snapshot?.error || null,
        metadata: { provider: adapter.providerId, upstreamStatus: status },
      };
    },
  };
}

/**
 * 按「网关供应商 + 渠道模型」构造调用客户端。
 * provider 必须是 ai_providers / Adapter 里真实存在的网关标识（由路由结果给出），
 * 不再是 models_config 的厂商标签；也不再存在「该厂商没配密钥就借用别家密钥」的回落。
 */
export async function createGatewayClient({ provider, providerModelId, apiKey } = {}) {
  const norm = String(provider || 'muapi').toLowerCase().trim();
  if (!hasProviderAdapter(norm)) {
    throw Object.assign(new Error(`供应商 ${norm || '(空)'} 没有可用适配器，禁止替换为其他供应商`), {
      code: 'ADAPTER_NOT_CONFIGURED',
    });
  }
  const adapter = await getProviderAdapter(norm, apiKey ? { apiKey } : {});
  return createAdapterGenerationProvider({ adapter, providerModelId });
}

export function getMockCapableProvider({ provider } = {}) {
  if (provider !== 'mock' && process.env.GENERATION_PROVIDER_MODE !== 'mock') return null;
  const explicitlyAllowed = process.env.ALLOW_MOCK_GENERATION === 'true' && process.env.E2E_TEST_MODE === 'true';
  if (process.env.NODE_ENV === 'production' && !explicitlyAllowed) {
    throw Object.assign(new Error('生产环境禁止使用模拟模型供应商'), { code: 'MOCK_PROVIDER_DISABLED' });
  }
  return createMockGenerationProvider({ outcome: process.env.MOCK_PROVIDER_OUTCOME || 'succeeded' });
}

export async function getGenerationProvider({ provider, providerModelId, apiKey } = {}) {
  const mock = getMockCapableProvider({ provider });
  if (mock) return mock;
  return createGatewayClient({ provider, providerModelId, apiKey });
}
