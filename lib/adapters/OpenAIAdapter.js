import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

export class OpenAIAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'openai',
      baseUrl: options.baseUrl || 'https://api.openai.com',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('OpenAI API 密钥未配置'));
    }

    const url = `${this.baseUrl}/v1/images/generations`;
    const model = providerModelId || 'dall-e-3';

    const body = {
      model,
      prompt: prompt || '',
      n: 1,
      size: parameters.resolution || '1024x1024',
      quality: parameters.quality === 'hd' ? 'hd' : 'standard',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.data?.[0]?.url) {
        const err = new Error(data.error?.message || 'OpenAI 图像生成失败');
        err.providerStatus = response.status;
        throw err;
      }

      const resultUrl = data.data[0].url;
      return {
        providerRequestId: `oai_${Date.now()}`,
        status: 'succeeded',
        resultUrl,
        actualCostUsd: body.quality === 'hd' ? 0.08 : 0.04,
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    return {
      status: 'succeeded',
      resultUrl: null,
      progress: 100,
    };
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, probeKind: 'credential', message: '未配置 OPENAI_API_KEY' };
      const res = await fetch(`${this.baseUrl}/v1/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: AbortSignal.timeout(6000),
      });
      return { healthy: res.ok, latencyMs: Date.now() - startedAt, probeKind: 'http', message: res.ok ? 'OK' : `HTTP ${res.status}` };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, probeKind: 'http', message: err.message };
    }
  }
}
