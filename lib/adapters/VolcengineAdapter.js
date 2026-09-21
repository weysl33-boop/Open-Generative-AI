import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

const ARK_BASE = 'https://ark.cn-beijing.volces.com/api/v3';

// 火山方舟对 Seedream 4.5 / 5.0 系要求最低约 3,686,400 像素，低于该值会被拒。
const MIN_HIGH_RES_PIXELS = 3686400;

const VERSIONED_MODELS = [
  [['5.0-pro', '5-0-pro'], 'doubao-seedream-5-0-pro-260628'],
  [['5.0', '5-0'], 'doubao-seedream-5-0-260128'],
  [['4.5', '4-5'], 'doubao-seedream-4-5-251128'],
  [['4.0', 'v4', '4-0'], 'doubao-seedream-4-0-250828'],
  [['v3', '3.0', '3-0'], 'doubao-seedream-4-0-250828'],
];

function resolveModelName(providerModelId) {
  const raw = String(providerModelId || '').toLowerCase();
  if (raw.startsWith('doubao-seedream')) return providerModelId;
  for (const [markers, model] of VERSIONED_MODELS) {
    if (markers.some((marker) => raw.includes(marker))) return model;
  }
  return 'doubao-seedream-4-0-250828';
}

function normalizeSize(size) {
  return String(size || '1024x1024').replace(/\*/g, 'x');
}

function escalateSize(size) {
  const [w, h] = String(size).split('x').map(Number);
  const width = Number.isFinite(w) && w > 0 ? w : 1024;
  const height = Number.isFinite(h) && h > 0 ? h : 1024;
  if (width * height >= MIN_HIGH_RES_PIXELS) return size;
  const ratio = width / height;
  if (Math.abs(ratio - 1) < 0.1) return '2048x2048';
  if (ratio > 1.5) return '2560x1440';
  if (ratio < 0.7) return '1440x2560';
  if (ratio > 1.1) return '2304x1728';
  return '1728x2304';
}

export class VolcengineAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'volcengine',
      baseUrl: options.baseUrl || process.env.VOLCENGINE_ARK_BASE_URL || ARK_BASE,
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('火山方舟 API 密钥未配置'));
    }

    const model = resolveModelName(providerModelId);
    let size = normalizeSize(parameters.size || parameters.resolution);
    if (model.includes('4-5') || model.includes('5-0')) size = escalateSize(size);

    const imageUrl = parameters.image_url || parameters.image || null;
    const body = {
      model,
      prompt: prompt || '',
      size,
      response_format: 'url',
      watermark: parameters.watermark === undefined ? false : Boolean(parameters.watermark),
      ...(imageUrl ? { image: imageUrl } : {}),
    };

    try {
      const response = await fetch(`${this.baseUrl}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      const resultUrl = data?.data?.[0]?.url || null;
      if (!response.ok || !resultUrl) {
        const err = new Error(data?.error?.message || `火山方舟图像生成失败 HTTP ${response.status}`);
        err.providerStatus = response.status;
        err.code = data?.error?.code;
        throw err;
      }

      return {
        providerRequestId: data.data[0].id || data.id || null,
        status: 'succeeded',
        resultUrl,
        actualCostUsd: Number(data.cost_usd || data.cost || 0),
        metadata: { model, size, requestedModel: providerModelId },
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId) {
    // 方舟图像接口为同步返回，不存在任务查询；保留接口以符合 Adapter 契约。
    return {
      status: 'failed',
      error: `火山方舟图像接口不提供任务查询（providerTaskId=${providerTaskId}）`,
      code: 'NOT_SUPPORTED',
    };
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, probeKind: 'credential', message: '未配置 VOLCENGINE_API_KEY' };
      return { healthy: true, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: '凭据已配置，未请求上游' };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: err.message };
    }
  }
}
