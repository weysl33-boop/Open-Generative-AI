import 'server-only';

export const PROVIDER_ERROR_CODES = Object.freeze({
  AUTH_ERROR: 'AUTH_ERROR',
  INSUFFICIENT_PROVIDER_BALANCE: 'INSUFFICIENT_PROVIDER_BALANCE',
  RATE_LIMIT: 'RATE_LIMIT',
  TIMEOUT: 'TIMEOUT',
  CONTENT_POLICY: 'CONTENT_POLICY',
  INVALID_INPUT: 'INVALID_INPUT',
  MODEL_UNAVAILABLE: 'MODEL_UNAVAILABLE',
  PROVIDER_INTERNAL_ERROR: 'PROVIDER_INTERNAL_ERROR',
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
});

// 确定不可自动切换供应商的致命错误（输入问题或内容违规）
export const NON_RETRYABLE_ERROR_CODES = new Set([
  PROVIDER_ERROR_CODES.CONTENT_POLICY,
  PROVIDER_ERROR_CODES.INVALID_INPUT,
]);

export class BaseAdapter {
  constructor({ providerId, baseUrl, apiKey, config = {} } = {}) {
    this.providerId = providerId;
    this.baseUrl = baseUrl ? baseUrl.replace(/\/$/, '') : '';
    this.apiKey = apiKey || null;
    this.config = config;
  }

  /**
   * 提交生成任务给供应商
   * @param {Object} options { providerModelId, prompt, parameters, idempotencyKey, signal }
   * @returns {Promise<{ providerRequestId: string, status: string, resultUrl?: string, actualCostUsd?: number, metadata?: Object }>}
   */
  async createTask(options) {
    throw new Error(`createTask not implemented for provider ${this.providerId}`);
  }

  /**
   * 轮询或查询供应商任务最新进度
   * @param {string} providerTaskId
   * @param {Object} options { signal }
   * @returns {Promise<{ status: string, resultUrl?: string, progress?: number, error?: string, rawData?: Object }>}
   */
  async getTask(providerTaskId, options = {}) {
    throw new Error(`getTask not implemented for provider ${this.providerId}`);
  }

  /**
   * 取消任务 (如支持)
   */
  async cancelTask(providerTaskId) {
    return { cancelled: false, reason: 'NOT_SUPPORTED' };
  }

  /**
   * 估算上游成本
   */
  estimateCost({ providerModelId, parameters = {} } = {}) {
    return { estimatedCostUsd: 0, currency: 'USD' };
  }

  /**
   * 状态归一化为系统标准任务状态
   * 标准状态: 'submitted' | 'processing' | 'succeeded' | 'failed' | 'cancelled'
   */
  normalizeStatus(rawStatus) {
    const s = String(rawStatus || '').toLowerCase();
    if (['completed', 'succeeded', 'success', 'done'].includes(s)) return 'succeeded';
    if (['failed', 'error', 'rejected'].includes(s)) return 'failed';
    if (['cancelled', 'canceled'].includes(s)) return 'cancelled';
    if (['processing', 'in_progress', 'running', 'generating'].includes(s)) return 'processing';
    return 'submitted';
  }

  /**
   * 结果提取归一化
   */
  normalizeResult(rawResponse) {
    return {
      resultUrl: rawResponse?.outputs?.[0] || rawResponse?.url || rawResponse?.video_url || null,
      providerRequestId: rawResponse?.request_id || rawResponse?.id || rawResponse?.task_id || null,
      actualCostUsd: Number(rawResponse?.cost_usd || 0),
      metadata: rawResponse || {},
    };
  }

  /**
   * 异常归一化映射为统一标准错误
   */
  normalizeError(error) {
    const message = error?.message || '供应商请求失败';
    const status = Number(error?.providerStatus || error?.status || error?.response?.status || 0);
    const rawCode = String(error?.code || '').toUpperCase();
    const strErr = (message + ' ' + rawCode).toLowerCase();

    let code = PROVIDER_ERROR_CODES.UNKNOWN_ERROR;

    if (status === 401 || status === 403 || strErr.includes('unauthorized') || strErr.includes('auth') || strErr.includes('forbidden') || strErr.includes('api key')) {
      code = PROVIDER_ERROR_CODES.AUTH_ERROR;
    } else if (status === 402 || strErr.includes('insufficient balance') || strErr.includes('quota') || strErr.includes('balance') || strErr.includes('arrears')) {
      code = PROVIDER_ERROR_CODES.INSUFFICIENT_PROVIDER_BALANCE;
    } else if (status === 429 || strErr.includes('rate limit') || strErr.includes('too many requests')) {
      code = PROVIDER_ERROR_CODES.RATE_LIMIT;
    } else if (error?.name === 'AbortError' || status === 408 || status === 504 || strErr.includes('timeout') || strErr.includes('timed out')) {
      code = PROVIDER_ERROR_CODES.TIMEOUT;
    } else if (strErr.includes('nsfw') || strErr.includes('moderation') || strErr.includes('content policy') || strErr.includes('sensitive') || strErr.includes('safety') || strErr.includes('violation')) {
      code = PROVIDER_ERROR_CODES.CONTENT_POLICY;
    } else if (status === 400 || status === 422 || strErr.includes('invalid') || strErr.includes('parameter') || strErr.includes('resolution')) {
      code = PROVIDER_ERROR_CODES.INVALID_INPUT;
    } else if (status === 503 || strErr.includes('maintenance') || strErr.includes('unavailable') || strErr.includes('overloaded')) {
      code = PROVIDER_ERROR_CODES.MODEL_UNAVAILABLE;
    } else if (status >= 500 && status < 600) {
      code = PROVIDER_ERROR_CODES.PROVIDER_INTERNAL_ERROR;
    } else if (strErr.includes('fetch failed') || strErr.includes('econnrefused') || strErr.includes('network')) {
      code = PROVIDER_ERROR_CODES.NETWORK_ERROR;
    }

    const normalized = new Error(message);
    normalized.code = code;
    normalized.provider = this.providerId;
    normalized.providerStatus = status;
    normalized.isRetryable = !NON_RETRYABLE_ERROR_CODES.has(code);
    return normalized;
  }

  /**
   * 处理供应商 Webhook 回调
   */
  async handleWebhook(payload, headers = {}) {
    return {
      providerRequestId: payload?.request_id || payload?.id || payload?.task_id || null,
      status: this.normalizeStatus(payload?.status),
      resultUrl: payload?.outputs?.[0] || payload?.url || null,
      actualCostUsd: Number(payload?.cost_usd || 0),
      rawPayload: payload,
    };
  }

  /**
   * 诊断健康检查
   */
  async healthCheck() {
    const startedAt = Date.now();
    try {
      if (!this.apiKey) {
        return { healthy: false, latencyMs: 0, message: '未配置 API Key 凭据' };
      }
      return { healthy: true, latencyMs: Date.now() - startedAt, message: 'OK' };
    } catch (err) {
      return { healthy: false, latencyMs: Date.now() - startedAt, message: err.message };
    }
  }

  /**
   * 查询账户余额
   */
  async getBalance() {
    return { balance: null, currency: 'USD', notSupported: true };
  }
}
