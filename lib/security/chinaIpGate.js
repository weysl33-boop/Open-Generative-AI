import {
  resolveClientIp,
  getChinaIpBlockConfig,
  isChinaIpGateForcedOff,
  isLoopbackOrPrivate,
  isIpInWhitelist,
  isChinaIp,
} from './chinaIpBlock.js';

// 境内回调来源（支付宝/微信/生成供应商）本身就在大陆网段内，签名校验才是它们的门禁，
// 地理拦截会把支付回执与异步出图直接掐断，因此这三类入口永久豁免。
const EXEMPT_PREFIXES = ['/api/health', '/api/ready', '/api/billing/webhooks/'];
const EXEMPT_PATTERNS = [/^\/api\/auth\/social-options\/?$/, /^\/api\/generations\/[^/]+\/callback\/?$/];

function isExemptPath(pathname) {
  if (EXEMPT_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return true;
  return EXEMPT_PATTERNS.some((re) => re.test(pathname));
}

export function gatePathname(request) {
  return request.nextUrl?.pathname || new URL(request.url).pathname;
}

// 决策与响应都在这里收口：middleware 只负责调用，任何异常一律放行，
// 不允许把"拦截功能坏掉"演变成"整站坏掉"。
export function evaluateChinaIpGate(request) {
  const decision = {
    blocked: false,
    reason: 'error',
    clientIp: null,
    ipSource: null,
    action: 'forbidden',
    customMessage: '',
  };

  try {
    const config = getChinaIpBlockConfig();
    const pathname = gatePathname(request);
    decision.action = config.action;
    decision.customMessage = config.custom_message;

    if (isChinaIpGateForcedOff()) {
      decision.reason = 'forced-off';
      return decision;
    }
    if (!config.enabled) {
      decision.reason = 'disabled';
      return decision;
    }
    if (isExemptPath(pathname)) {
      decision.reason = 'exempt-path';
      return decision;
    }
    if (pathname.startsWith('/api/') && !config.block_api) {
      decision.reason = 'api-allowed';
      return decision;
    }

    const { ip, source } = resolveClientIp(request.headers);
    decision.clientIp = ip;
    decision.ipSource = source;

    if (isLoopbackOrPrivate(ip)) {
      decision.reason = 'private';
      return decision;
    }
    if (isIpInWhitelist(ip, config.whitelist_ips)) {
      decision.reason = 'whitelist';
      return decision;
    }
    if (isChinaIp(ip, request.headers)) {
      decision.blocked = true;
      decision.reason = 'china-ip';
      return decision;
    }

    decision.reason = 'non-china';
    return decision;
  } catch (err) {
    console.error('[chinaIpGate] 判定异常，按放行处理:', err);
    decision.reason = 'error';
    return decision;
  }
}

export { isExemptPath };
