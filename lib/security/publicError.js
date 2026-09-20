import 'server-only';

const SAFE_ERROR_CODES = new Set([
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'IDEMPOTENCY_CONFLICT',
  'IDEMPOTENCY_REQUIRED',
  'INSUFFICIENT_CREDITS',
  'MODEL_NOT_FOUND',
  'USER_NOT_FOUND',
  'ACCOUNT_BINDING_CONFLICT',
  'ACCOUNT_SUSPENDED',
  'ACCOUNT_ALREADY_BOUND',
  'PROVIDER_NOT_CONFIGURED',
  'SETTLEMENT_MISMATCH',
  'ONBOARDING_FIELD_TOO_LONG',
]);

const INTERNAL_ERROR_TEXT = /password|secret|token|authorization|cookie|postgres|database|sql|query|relation|constraint|stack|at\s+file:|https?:\/\//i;

export function publicErrorMessage(error, fallback = '请求暂时无法完成，请稍后重试') {
  const message = String(error?.message || '').trim();
  if (!message || message.length > 240) return fallback;
  if (!SAFE_ERROR_CODES.has(String(error?.code || '')) || INTERNAL_ERROR_TEXT.test(message)) return fallback;
  return message;
}

function redactSecrets(text) {
  return text
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, '[已脱敏]')
    .replace(/\bark-[0-9a-f-]{20,}\b/gi, '[已脱敏]')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [已脱敏]')
    .replace(/([?&](?:api[_-]?key|access_token|token|key)=)[^&\s]+/gi, '$1[已脱敏]')
    .replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+:[^\s@/]+@/gi, '$1[已脱敏]@');
}

// 管理端诊断接口（渠道探测等）必须让运维看到上游真实原因，因此不走 publicErrorMessage 的
// 错误码白名单；适配器返回的文本可能内联 ?key=… 或回显凭据，故统一脱敏 + 截断后再出站。
export function diagnosticErrorMessage(source, fallback = '上游请求失败，请查看服务端日志') {
  const raw = String(source?.message ?? source ?? '').replace(/[\r\n\t]+/g, ' ').trim();
  if (!raw) return fallback;
  const text = redactSecrets(raw);
  return text.length > 200 ? `${text.slice(0, 200)}…` : text;
}
