/**
 * 渠道健康探针的判定口径与批量调度。
 * 纯逻辑、不依赖 server-only 与数据库，可被 `node --test` 直接驱动。
 */

export const PROBE_KIND = Object.freeze({
  HTTP: 'http',
  CREDENTIAL: 'credential',
});

export const HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  UNHEALTHY: 'unhealthy',
});

/**
 * 毫秒归一化：只有真正的非负有限数才算一个测量值。
 * `Number(null) === 0`，所以 null 必须显式挡住，否则"没有测量值"会变成 0ms。
 */
export function toFiniteMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function toProbeKind(value) {
  const kind = String(value ?? '').trim().toLowerCase();
  return kind === PROBE_KIND.HTTP || kind === PROBE_KIND.CREDENTIAL ? kind : null;
}

function toMessage(value, fallback) {
  const text = String(value ?? '').trim();
  // 探针原始输出可能带上游 URL（含 query 凭据）或服务商报错正文，只回传截断后的白名单字段。
  return (text || fallback).slice(0, 200);
}

/**
 * 归一化一次探针结果。
 *
 * 适配器契约历史上不统一：多数返回 `{ healthy }`，Runway/Luma 返回 `{ status }`，
 * 只认后者会把所有成功探测一律判成 degraded。
 *
 * 只声明凭据是否配齐的探针没有发生网络往返，它的 latencyMs 是本地耗时，
 * 记成实测延迟会让管理员以为渠道已经连通，因此强制置空。
 */
export function normalizeProbeOutcome(raw, { elapsedMs = null, fallbackMessage = '探针未返回说明' } = {}) {
  const wallMs = toFiniteMs(elapsedMs);
  if (!raw || typeof raw !== 'object') {
    return {
      healthStatus: HEALTH_STATUS.DEGRADED,
      latencyMs: wallMs,
      probeKind: null,
      balance: null,
      message: toMessage(null, '探针返回了无法判定的结果'),
    };
  }

  const probeKind = toProbeKind(raw.probeKind ?? raw.probe_kind);
  const status = String(raw.status ?? '').trim().toLowerCase();
  const isHealthy = raw.healthy === true || status === HEALTH_STATUS.HEALTHY;
  const balance = Number.isFinite(Number(raw.balance)) ? Number(raw.balance) : null;

  return {
    // 只有上游明确说 unhealthy 才是红色故障；其余未通过一律 degraded（待办，不是故障）。
    // 凭据缺失也归入 degraded：它表示"还没接上"，不是"接上了但坏了"，
    // 染红会让管理员去查一条根本没配 Key 的渠道。
    healthStatus: isHealthy
      ? HEALTH_STATUS.HEALTHY
      : status === HEALTH_STATUS.UNHEALTHY && probeKind !== PROBE_KIND.CREDENTIAL
        ? HEALTH_STATUS.UNHEALTHY
        : HEALTH_STATUS.DEGRADED,
    latencyMs: probeKind === PROBE_KIND.CREDENTIAL ? null : (toFiniteMs(raw.latencyMs) ?? wallMs),
    probeKind,
    balance,
    message: toMessage(raw.message, fallbackMessage),
  };
}

/**
 * 在发出任何网络请求之前就失败的原因：没有适配器、没有凭据。
 * 适配器工厂是 fail-closed 的（供应商未知 / 无 Key 直接抛错），所以这类失败
 * 比想象中常见，不能按"请求发出去了但没回来"记账。
 */
export const PREFLIGHT_PROBE_ERROR_CODES = Object.freeze([
  'ADAPTER_NOT_CONFIGURED',
  'PROVIDER_CREDENTIAL_MISSING',
]);

export function isPreflightProbeFailure(error) {
  const code = String(error?.code ?? '').trim();
  return PREFLIGHT_PROBE_ERROR_CODES.includes(code);
}

/**
 * 探针自身抛错。
 *
 * 已经请求过上游的失败才是"实测故障"；没配 Key / 没有适配器根本没有网络往返，
 * 把它记成 http + unhealthy 会同时犯两个错：页面上说这是实测延迟，
 * 路由又以「供应商健康检查未通过」为由把一条待接入的渠道判成不可用。
 */
export function probeFailureOutcome(error, { elapsedMs = null } = {}) {
  const preflight = isPreflightProbeFailure(error);
  return {
    healthStatus: preflight ? HEALTH_STATUS.DEGRADED : HEALTH_STATUS.UNHEALTHY,
    latencyMs: preflight ? null : toFiniteMs(elapsedMs),
    probeKind: preflight ? PROBE_KIND.CREDENTIAL : PROBE_KIND.HTTP,
    balance: null,
    message: toMessage(error?.message, '健康探针连接失败'),
    errorCode: error?.code || 'PROBE_FAILED',
  };
}

/**
 * 限并发映射：结果顺序与输入一致，单个条目不影响其它条目。
 * 探针会真的打上游，不限并发会把一次全量扫描变成对供应商的自 DDoS。
 */
export async function mapWithConcurrency(items, limit, worker) {
  const size = Math.max(1, Math.floor(Number(limit)) || 1);
  const results = new Array(items.length);
  let cursor = 0;

  const lanes = Array.from({ length: Math.min(size, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(lanes);
  return results;
}

export function summarizeProbeResults(results) {
  const summary = {
    probed: results.length,
    healthy: 0,
    degraded: 0,
    unhealthy: 0,
    credentialOnly: 0,
  };

  for (const result of results) {
    if (summary[result.healthStatus] !== undefined) summary[result.healthStatus] += 1;
    if (result.probeKind === PROBE_KIND.CREDENTIAL) summary.credentialOnly += 1;
  }

  return summary;
}
