export const PAYMENT_PROVIDER_ACTIONS = Object.freeze([
  'createCheckout',
  'retrievePayment',
  'cancel',
  'refund',
  'verifyWebhookSignature',
]);

export class PaymentProviderError extends Error {
  constructor(message, { provider, action, code = 'PAYMENT_PROVIDER_ERROR', retryable = false, status = 502, cause } = {}) {
    super(message, { cause });
    this.name = 'PaymentProviderError';
    this.provider = provider || 'unknown';
    this.action = action || 'unknown';
    this.code = code;
    this.retryable = Boolean(retryable);
    this.status = status;
  }
}

export function assertPaymentProvider(provider) {
  for (const action of PAYMENT_PROVIDER_ACTIONS) {
    if (!provider || typeof provider[action] !== 'function') {
      throw new TypeError(`missing payment provider method: ${action}`);
    }
  }
  return provider;
}

function isRetryableStatus(status) {
  return [408, 409, 425, 429, 500, 502, 503, 504].includes(Number(status));
}

export function normalizeProviderError(error, { provider = 'unknown', action = 'unknown' } = {}) {
  if (error instanceof PaymentProviderError) return error;
  const status = Number(error?.statusCode || error?.status || error?.raw?.statusCode || 0) || null;
  const code = error?.code && /^[A-Z0-9_:-]{2,80}$/.test(String(error.code))
    ? String(error.code)
    : `PAYMENT_${provider.toUpperCase()}_ERROR`;
  const networkRetryable = ['ECONNRESET', 'ETIMEDOUT', 'ECONNREFUSED', 'EAI_AGAIN'].includes(String(error?.code || '').toUpperCase());
  const safeMessage = isRetryableStatus(status)
    ? '支付供应商暂时不可用，请稍后重试'
    : '支付供应商请求失败，请稍后重试或联系支持';
  return new PaymentProviderError(safeMessage, {
    provider,
    action,
    code,
    retryable: Boolean(error?.retryable) || isRetryableStatus(status) || networkRetryable,
    status: status || 502,
    cause: error,
  });
}

// 厂商只在收到肯定应答后停止重推。把「能不能确认收到」的判定收在一处：
// 验签不通过是伪造或商户密钥配错，重推也没用（reject）；履约没跑完必须让厂商继续重推（retry）。
const NOTIFICATION_REJECT_CODES = new Set(['WEBHOOK_SIGNATURE_INVALID', 'WEBHOOK_HEADERS_MISSING']);

export function paymentNotificationOutcome({ error = null, result = null } = {}) {
  if (error) return NOTIFICATION_REJECT_CODES.has(String(error.code || '')) ? 'reject' : 'retry';
  if (result?.retryable) return 'retry';
  // 重推也不会变好的失败（金额对不上、报文缺订单号）该让厂商停手，而不是无限重试。
  if (result?.success === false) return 'reject';
  return 'ack';
}
