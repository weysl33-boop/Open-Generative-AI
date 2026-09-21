import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

export class MiniMaxAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'minimax',
      baseUrl: options.baseUrl || 'https://api.minimax.chat',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('MiniMax / 海螺 API 密钥未配置'));
    }

    const isI2V = Boolean(parameters.image_url || parameters.imageUrl);
    const url = `${this.baseUrl}/v1/video_generation`;

    const body = {
      model: providerModelId || 'video-01',
      prompt: prompt || '',
      ...(isI2V ? { first_frame_image: parameters.image_url || parameters.imageUrl } : {}),
      prompt_optimizer: true,
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
      if (!response.ok || (data.base_resp && data.base_resp.status_code !== 0)) {
        const err = new Error(data.base_resp?.status_msg || data.message || 'MiniMax 任务提交失败');
        err.providerStatus = response.status || 400;
        throw err;
      }

      const taskId = data.task_id;
      return {
        providerRequestId: taskId,
        status: 'processing',
        resultUrl: null,
        actualCostUsd: 0.45,
        metadata: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('MiniMax / 海螺 API 密钥未配置'));
    }

    const url = `${this.baseUrl}/v1/query/video_generation?task_id=${providerTaskId}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || (data.base_resp && data.base_resp.status_code !== 0)) {
        const err = new Error(data.base_resp?.status_msg || `MiniMax 任务查询失败 HTTP ${response.status}`);
        err.providerStatus = response.status;
        throw err;
      }

      const rawStatus = String(data.status || '').toLowerCase();
      let status = 'processing';
      let resultUrl = null;

      if (rawStatus === 'success') {
        status = 'succeeded';
        resultUrl = data.download_url || data.file_url || null;
      } else if (rawStatus === 'fail') {
        status = 'failed';
      }

      return {
        status,
        resultUrl,
        progress: status === 'succeeded' ? 100 : 50,
        error: data.base_resp?.status_msg || null,
        actualCostUsd: 0.45,
        rawData: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, probeKind: 'credential', message: '未配置 MINIMAX_API_KEY' };
      return { healthy: true, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: '凭据已配置，未请求上游' };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: err.message };
    }
  }
}
