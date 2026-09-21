import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

/**
 * Runway 官方 API 驱动适配器
 * 适配 Gen-3 Alpha, Turbo, Act-Two 等官方视频生成与编辑接口
 */
export class RunwayAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'runway',
      baseUrl: options.baseUrl || 'https://api.runwayml.com',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('Runway API 密钥未配置'));
    }

    const model = providerModelId || 'gen3a_turbo';
    const isImageToVideo = Boolean(parameters.image_url || parameters.imageUrl || parameters.input_image);
    const endpoint = isImageToVideo ? `${this.baseUrl}/v1/image_to_video` : `${this.baseUrl}/v1/tasks`;

    const body = {
      model,
      promptText: prompt || '',
      watermark: false,
      duration: parameters.duration || 5,
      ratio: parameters.aspect_ratio || parameters.aspectRatio || '16:9',
    };

    if (isImageToVideo) {
      body.promptImage = parameters.image_url || parameters.imageUrl || parameters.input_image;
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'X-Runway-Version': '2024-09-13',
        },
        body: JSON.stringify(body),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.id) {
        const err = new Error(data.error || data.message || 'Runway 任务提交失败');
        err.providerStatus = response.status;
        throw err;
      }

      return {
        providerRequestId: data.id,
        status: 'processing',
        resultUrl: null,
        actualCostUsd: 0.15,
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerRequestId, { signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('Runway API 密钥未配置'));
    }

    try {
      const response = await fetch(`${this.baseUrl}/v1/tasks/${encodeURIComponent(providerRequestId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Runway-Version': '2024-09-13',
        },
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data.error || '获取 Runway 任务状态失败');
        err.providerStatus = response.status;
        throw err;
      }

      const statusMap = {
        PENDING: 'processing',
        RUNNING: 'processing',
        THROTTLED: 'processing',
        SUCCEEDED: 'succeeded',
        FAILED: 'failed',
        CANCELLED: 'cancelled',
      };

      const status = statusMap[data.status] || (data.status === 'SUCCEEDED' ? 'succeeded' : 'processing');
      const resultUrl = data.output?.[0] || data.resultUrl || null;

      return {
        providerRequestId,
        status,
        resultUrl,
        error: data.failure || data.failureCode || null,
        actualCostUsd: 0.15,
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { status: 'unhealthy', latencyMs: 0, probeKind: 'credential', message: 'Runway API Key 缺失' };
    }

    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/v1/tasks?limit=1`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          'X-Runway-Version': '2024-09-13',
        },
      });

      const latencyMs = Date.now() - start;
      if (response.ok || response.status === 200) {
        return { status: 'healthy', latencyMs, probeKind: 'http', message: 'Runway 官方 API 正常在线' };
      }
      return { status: 'degraded', latencyMs, probeKind: 'http', message: `Runway 返回 HTTP ${response.status}` };
    } catch (err) {
      return { status: 'unhealthy', latencyMs: Date.now() - start, probeKind: 'http', message: err.message };
    }
  }
}
