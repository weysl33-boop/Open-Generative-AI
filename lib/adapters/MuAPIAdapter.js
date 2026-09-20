import 'server-only';

import { BaseAdapter, PROVIDER_ERROR_CODES } from './BaseAdapter.js';

export class MuAPIAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'muapi',
      baseUrl: options.baseUrl || process.env.UPSTREAM_AI_BASE || 'https://api.muapi.ai',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('MuAPI 密钥未配置'));
    }

    const endpoint = providerModelId || 'flux-schnell';
    const url = `${this.baseUrl}/api/v1/${endpoint}`;
    const payload = {
      prompt: prompt || '',
      ...parameters,
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        },
        body: JSON.stringify(payload),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data?.error || data?.message || response.statusText || 'MuAPI 任务提交失败');
        err.providerStatus = response.status;
        throw err;
      }

      const requestId = data.request_id || data.id || null;
      const initialResultUrl = data.outputs?.[0] || data.url || data.output?.url || null;

      return {
        providerRequestId: requestId,
        status: initialResultUrl ? 'succeeded' : 'processing',
        resultUrl: initialResultUrl,
        actualCostUsd: Number(data.cost_usd || 0),
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('MuAPI 密钥未配置'));
    }

    const pollUrl = `${this.baseUrl}/api/v1/predictions/${providerTaskId}/result`;
    try {
      const response = await fetch(pollUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
        },
        signal,
      });

      if (!response.ok) {
        const err = new Error(`MuAPI 查询失败 HTTP ${response.status}`);
        err.providerStatus = response.status;
        throw err;
      }

      const data = await response.json().catch(() => ({}));
      const rawStatus = String(data.status || '').toLowerCase();
      const status = this.normalizeStatus(rawStatus);
      const resultUrl = data.outputs?.[0] || data.url || data.output?.url || null;
      const errorMsg = data.error || data.message || (typeof data.detail === 'string' ? data.detail : null);

      return {
        status,
        resultUrl,
        progress: data.progress || (status === 'succeeded' ? 100 : 50),
        error: errorMsg,
        actualCostUsd: Number(data.cost_usd || 0),
        rawData: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, message: '未配置 MUAPI_API_KEY' };
      const res = await fetch(`${this.baseUrl}/api/v1/models`, {
        method: 'GET',
        headers: { 'x-api-key': this.apiKey },
        signal: AbortSignal.timeout(6000),
      });
      const latencyMs = Date.now() - startedAt;
      return {
        healthy: res.ok,
        latencyMs,
        message: res.ok ? 'OK' : `HTTP ${res.status}`,
      };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, message: err.message };
    }
  }
}
