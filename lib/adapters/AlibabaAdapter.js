import 'server-only';

import { BaseAdapter } from './BaseAdapter.js';

export class AlibabaAdapter extends BaseAdapter {
  constructor(options = {}) {
    super({
      providerId: 'alibaba',
      baseUrl: options.baseUrl || 'https://dashscope.aliyuncs.com',
      apiKey: options.apiKey,
      config: options.config || {},
    });
  }

  async createTask({ providerModelId, prompt, parameters = {}, idempotencyKey, signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('阿里云百炼 / DashScope API 密钥未配置'));
    }

    const isVideo = String(providerModelId || '').includes('t2v') || String(providerModelId || '').includes('video');
    const endpoint = isVideo
      ? '/api/v1/services/aigc/video-generation/video-synthesis'
      : '/api/v1/services/aigc/text2image/image-synthesis';
    const url = `${this.baseUrl}${endpoint}`;

    const modelName = providerModelId || (isVideo ? 'wanx2.1-t2v-turbo' : 'wanx2.1-t2i-turbo');
    const body = {
      model: modelName,
      input: {
        prompt: prompt || '',
        ...(parameters.image_url ? { img_url: parameters.image_url } : {}),
      },
      parameters: {
        size: parameters.resolution || (isVideo ? '1280*720' : '1024*1024'),
        ...(parameters.aspect_ratio ? { aspect_ratio: parameters.aspect_ratio } : {}),
        watermark: parameters.watermark === undefined ? false : Boolean(parameters.watermark),
      },
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'X-DashScope-Async': 'enable',
        },
        body: JSON.stringify(body),
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.output?.task_id) {
        const err = new Error(data.message || data.output?.message || 'DashScope 任务提交失败');
        err.providerStatus = response.status || 400;
        throw err;
      }

      const taskId = data.output.task_id;
      return {
        providerRequestId: taskId,
        status: 'processing',
        resultUrl: null,
        actualCostUsd: isVideo ? 0.35 : 0.03,
        metadata: data.output || {},
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async getTask(providerTaskId, { signal } = {}) {
    if (!this.apiKey) {
      throw this.normalizeError(new Error('阿里云百炼 / DashScope API 密钥未配置'));
    }

    const url = `${this.baseUrl}/api/v1/tasks/${providerTaskId}`;
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
        },
        signal,
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data.message || `DashScope 任务查询失败 HTTP ${response.status}`);
        err.providerStatus = response.status;
        throw err;
      }

      const output = data.output || {};
      const taskStatus = String(output.task_status || '').toUpperCase();
      let status = 'processing';
      let resultUrl = null;

      if (taskStatus === 'SUCCEEDED') {
        status = 'succeeded';
        resultUrl = output.video_url || output.results?.[0]?.url || null;
      } else if (taskStatus === 'FAILED') {
        status = 'failed';
      }

      return {
        status,
        resultUrl,
        progress: status === 'succeeded' ? 100 : 50,
        error: output.message || null,
        actualCostUsd: 0.35,
        rawData: data,
      };
    } catch (error) {
      throw this.normalizeError(error);
    }
  }

  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) return { healthy: false, latencyMs: 0, probeKind: 'credential', message: '未配置 DASHSCOPE_API_KEY' };
      return { healthy: true, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: '凭据已配置，未请求上游' };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, probeKind: 'credential', message: err.message };
    }
  }
}
