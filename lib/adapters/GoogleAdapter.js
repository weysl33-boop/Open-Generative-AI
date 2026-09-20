import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

export class GoogleAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'google',
      baseUrl: options.baseUrl || 'https://generativelanguage.googleapis.com',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('Google AI / Imagen API 密钥未配置'));
    }

    const model = providerModelId || 'imagen-3.0-generate-002';
    const url = `${this.baseUrl}/v1beta/models/${model}:predict?key=${this.apiKey}`;

    const body = {
      instances: [{ prompt: prompt || '' }],
      parameters: {
        sampleCount: 1,
        aspectRatio: parameters.aspect_ratio || '1:1',
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data.error?.message || 'Google Imagen 图像生成失败');
        err.providerStatus = response.status;
        throw err;
      }

      const prediction = data.predictions?.[0];
      let resultUrl = prediction?.uri || prediction?.url || null;
      if (!resultUrl && prediction?.bytesBase64Encoded) {
        resultUrl = `data:image/png;base64,${prediction.bytesBase64Encoded}`;
      }

      return {
        providerRequestId: `goog_${Date.now()}`,
        status: resultUrl ? 'succeeded' : 'failed',
        resultUrl,
        actualCostUsd: 0.03,
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    return { status: 'succeeded', resultUrl: null, progress: 100 };
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, message: '未配置 GOOGLE_API_KEY' };
      const res = await fetch(`${this.baseUrl}/v1beta/models?key=${this.apiKey}`, {
        signal: AbortSignal.timeout(6000),
      });
      return { healthy: res.ok, latencyMs: Date.now() - startedAt, message: res.ok ? 'OK' : `HTTP ${res.status}` };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, message: err.message };
    }
  }
}
