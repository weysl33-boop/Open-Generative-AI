import 'server-only';

import { NextResponse } from 'next/server';
import { authorizeScopedProxyPath, POLICY } from './legacyProxyPolicy.js';
import { consumeRateLimit, getClientIp, rateLimitResponse } from './requestGuard.js';

// 上游代理的读操作也可能被用来刷接口，单独给一个宽松但存在的限额。
const READ_LIMIT = { limit: 600, windowMs: 60 * 1000 };
// 计费调用直接消耗平台余额且不扣用户积分，限额必须收紧。
const BILLED_BURST = { limit: 20, windowMs: 60 * 1000 };
const BILLED_SUSTAINED = { limit: 150, windowMs: 60 * 60 * 1000 };

function denyResponse(decision, path) {
  console.warn('[legacy_proxy/denied]', JSON.stringify({ decision, path }));
  return NextResponse.json(
    {
      error: decision === POLICY.DENY_BILLING_REQUIRED
        ? '该推理入口尚未接入平台额度结算，暂不可用'
        : '该接口不可用',
      code: decision,
    },
    { status: decision === POLICY.DENY_BILLING_REQUIRED ? 402 : decision === POLICY.DENY_ACCOUNT ? 403 : 404 },
  );
}

/**
 * 对 agents / app / workflow 代理做默认拒绝；尚未接入额度预扣的推理操作会返回 402。
 * @returns {Promise<NextResponse|null>} null 表示放行
 */
export async function guardScopedProxyRequest({ request, scope, pathSegments, method, user }) {
  const verdict = authorizeScopedProxyPath(scope, pathSegments, method || request?.method || 'GET');
  if (!verdict.allow) return denyResponse(verdict.decision, `${scope}${verdict.path}`);

  const subject = user?.id || getClientIp(request);
  const read = await consumeRateLimit({ scope: `proxy_read_${scope}`, subject, ...READ_LIMIT });
  if (!read.allowed) return rateLimitResponse(read);

  if (verdict.billed) {
    const burst = await consumeRateLimit({ scope: `proxy_billed_${scope}`, subject, ...BILLED_BURST });
    if (!burst.allowed) return rateLimitResponse(burst);
    const sustained = await consumeRateLimit({ scope: `proxy_billed_${scope}_hourly`, subject, ...BILLED_SUSTAINED });
    if (!sustained.allowed) return rateLimitResponse(sustained);
  }

  return null;
}
