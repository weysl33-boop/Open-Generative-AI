import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

export class KlingAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'kling',
      baseUrl: options.baseUrl || 'https://api.klingai.com',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('快手可灵 API 密钥未配置'));
    }

    const isI2V = Boolean(parameters.image_url || parameters.imageUrl);
    const endpoint = isI2V ? '/v1/videos/image2video' : '/v1/videos/text2video';
    const url = `${this.baseUrl}${endpoint}`;

    const body = {
      model_name: providerModelId || 'kling-video-2-6',
      prompt: prompt || '',
      ...(isI2V ? { image: parameters.image_url || parameters.imageUrl } : {}),
      duration: parameters.duration ? String(parseInt(parameters.duration, 10)) : '5',
      aspect_ratio: parameters.aspect_ratio || '16:9',
      mode: parameters.quality === 'pro' || parameters.mode === 'pro' ? 'pro' : 'std',
      ...(parameters.negative_prompt ? { negative_prompt: parameters.negative_prompt } : {}),
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
      if (!response.ok || data.code !== 0) {
        const err = new Error(data.message || data.error || '可灵任务提交失败');
        err.providerStatus = response.status || 400;
        throw err;
      }

      const taskId = data.data?.task_id;
      return {
        providerRequestId: taskId,
        status: 'processing',
        resultUrl: null,
        actualCostUsd: 0.60,
        metadata: data.data || {},
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('快手可灵 API 密钥未配置'));
    }

    const url = `${this.baseUrl}/v1/videos/text2video/${providerTaskId}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.code !== 0) {
        const err = new Error(data.message || `可灵任务查询失败 HTTP ${response.status}`);
        err.providerStatus = response.status;
        throw err;
      }

      const taskData = data.data || {};
      const rawStatus = String(taskData.task_status || '').toLowerCase();
      let status = 'processing';
      let resultUrl = null;

      if (rawStatus === 'succeed' || rawStatus === 'success') {
        status = 'succeeded';
        resultUrl = taskData.task_result?.videos?.[0]?.url || null;
      } else if (rawStatus === 'failed') {
        status = 'failed';
      }

      return {
        status,
        resultUrl,
        progress: status === 'succeeded' ? 100 : 60,
        error: taskData.task_status_msg || null,
        actualCostUsd: 0.60,
        rawData: taskData,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, probeKind: 'credential', message: '未配置 KLING_API_KEY' };
      return { healthy: true, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: '凭据已配置，未请求上游' };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: err.message };
    }
  }
}
