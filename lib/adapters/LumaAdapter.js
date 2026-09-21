import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

/**
 * Luma Dream Machine 官方 API 驱动适配器
 * 适配 Luma Dream Machine 官方文生视频 / 图生视频接口
 */
export class LumaAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'luma',
      baseUrl: options.baseUrl || 'https://api.lumalabs.ai',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('Luma API 密钥未配置'));
    }

    const endpoint = `${this.baseUrl}/dream-machine/v1/generations`;
    const isImageToVideo = Boolean(parameters.image_url || parameters.imageUrl || parameters.input_image);

    const body = {
      prompt: prompt || '',
      aspect_ratio: parameters.aspect_ratio || parameters.aspectRatio || '16:9',
      loop: Boolean(parameters.loop),
    };

    if (isImageToVideo) {
      body.keyframes = {
        frame0: {
          type: 'image',
          url: parameters.image_url || parameters.imageUrl || parameters.input_image,
        },
      };
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.id) {
        const err = new Error(data.error || data.detail || 'Luma 任务创建失败');
        err.providerStatus = response.status;
        throw err;
      }

      return {
        providerRequestId: data.id,
        status: 'processing',
        resultUrl: null,
        actualCostUsd: 0.16,
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerRequestId, { signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('Luma API 密钥未配置'));
    }

    try {
      const response = await fetch(`${this.baseUrl}/dream-machine/v1/generations/${encodeURIComponent(providerRequestId)}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data.error || '获取 Luma 任务状态失败');
        err.providerStatus = response.status;
        throw err;
      }

      const statusMap = {
        queued: 'processing',
        dreaming: 'processing',
        completed: 'succeeded',
        failed: 'failed',
      };

      const status = statusMap[data.state] || (data.state === 'completed' ? 'succeeded' : 'processing');
      const resultUrl = data.assets?.video || null;

      return {
        providerRequestId,
        status,
        resultUrl,
        error: data.failure_reason || null,
        actualCostUsd: 0.16,
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async healthCheck() {
    if (!this.apiKey) {
      return { status: 'unhealthy', latencyMs: 0, probeKind: 'credential', message: 'Luma API Key 缺失' };
    }

    const start = Date.now();
    try {
      const response = await fetch(`${this.baseUrl}/dream-machine/v1/generations?limit=1`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
      });

      const latencyMs = Date.now() - start;
      if (response.ok || response.status === 200) {
        return { status: 'healthy', latencyMs, probeKind: 'http', message: 'Luma Dream Machine 官方 API 正常在线' };
      }
      return { status: 'degraded', latencyMs, probeKind: 'http', message: `Luma 返回 HTTP ${response.status}` };
    } catch (err) {
      return { status: 'unhealthy', latencyMs: Date.now() - start, probeKind: 'http', message: err.message };
    }
  }
}
