import 'server-only';

// Legacy upstream proxy admission policy.
//
// This proxy signs requests with a server-managed provider credential. Account,
// billing and arbitrary inference paths must therefore be explicitly denied or
// moved behind the metered generation API.

export const POLICY = Object.freeze({
  ALLOW_GENERATE: 'ALLOW_GENERATE',
  ALLOW_UTILITY: 'ALLOW_UTILITY',
  ALLOW_POLL: 'ALLOW_POLL',
  ALLOW_ESTIMATE: 'ALLOW_ESTIMATE',
  DENY_BILLING_REQUIRED: 'DENY_BILLING_REQUIRED',
  DENY_ACCOUNT: 'DENY_ACCOUNT',
  DENY_PATH: 'DENY_PATH',
});

const DENIED_FIRST_SEGMENTS = new Set([
  'account', 'accounts', 'balance', 'billing', 'wallet', 'wallets', 'history',
  'user', 'users', 'me', 'profile', 'key', 'keys', 'api-key', 'apikey',
  'secret', 'secrets', 'token', 'tokens', 'subscription', 'subscriptions',
  'subscribe', 'team', 'teams', 'org', 'orgs', 'member', 'members',
  'invoice', 'invoices', 'payment', 'payments', 'payout', 'referral',
  'referrals', 'usage', 'quota', 'admin', 'internal', 'debug', 'metric', 'metrics',
]);

const UTILITY_POST_PATHS = new Set(['upload_file', 'app/calculate_dynamic_cost']);

function first(pathSegments) {
  return String(pathSegments?.[0] || '').toLowerCase();
}

export function isLocalCreationId(value) {
  return String(value || '').startsWith('gen_');
}

export function isPredictionPoll(pathSegments) {
  return Array.isArray(pathSegments)
    && pathSegments.length === 3
    && String(pathSegments[0]).toLowerCase() === 'predictions'
    && String(pathSegments[2]).toLowerCase() === 'result';
}

function isEstimateCost(pathSegments) {
  return Array.isArray(pathSegments)
    && pathSegments.length === 3
    && String(pathSegments[0]).toLowerCase() === 'models'
    && String(pathSegments[2]).toLowerCase() === 'estimate-cost';
}

export function isCreativeAgentInferenceRequest(pathSegments, method = 'GET') {
  if (String(method).toUpperCase() !== 'POST') return false;
  const segments = (pathSegments || []).map((segment) => String(segment).toLowerCase());
  if (segments[0] === 'sessions' && segments.length === 3) {
    return ['chat', 'run-skill'].includes(segments[2]);
  }
  // Approving/resuming a provider job may execute image or video tools. Only
  // explicit cancellation is safe to leave on the unmetered legacy proxy.
  if (segments[0] === 'jobs' && segments.length === 3) {
    return !['cancel', 'stop'].includes(segments[2]);
  }
  return false;
}

export const PROXY_SCOPE = Object.freeze({
  AGENTS: 'agents',
  APP: 'app',
  WORKFLOW: 'workflow',
});

const ANY = '*';

// These are the non-inference paths the shipped clients need. The separately
// classified billed paths below are deliberately denied until they use a
// user-credit reservation and settlement path.
const PROXY_ALLOW_RULES = {
  [PROXY_SCOPE.AGENTS]: [
    ['GET', []],
    ['POST', []],
    ['GET', ['skills']],
    ['POST', ['suggest']],
    ['GET', ['templates', 'agents']],
    ['GET', ['user', 'agents']],
    ['GET', ['user', 'conversations']],
    ['GET', ['featured', 'agents']],
    ['GET', [ANY, 'profile']],
    ['GET', ['by-slug', ANY]],
    ['PUT', ['by-slug', ANY]],
    ['DELETE', ['by-slug', ANY]],
    ['GET', ['by-slug', ANY, ANY]],
    ['POST', ['by-slug', ANY, 'chat']],
    ['POST', ['by-slug', ANY, 'like']],
    ['POST', ['by-slug', ANY, 'preview-realign']],
  ],
  [PROXY_SCOPE.APP]: [
    ['GET', ['get_file_upload_url']],
    ['GET', ['get_upload_file']],
    ['GET', ['interests']],
    ['POST', ['interest']],
    ['POST', ['calculate_dynamic_cost']],
  ],
  [PROXY_SCOPE.WORKFLOW]: [
    ['GET', ['get-template-workflows']],
    ['GET', ['get-workflow-defs']],
    ['GET', ['get-published-workflows']],
    ['GET', ['get-workflow-def', ANY]],
    ['GET', [ANY, 'api-inputs']],
    ['GET', [ANY, 'node-schemas']],
    ['GET', [ANY, 'api-node-schemas']],
    ['GET', ['run', ANY, 'status']],
    ['GET', ['run', ANY, 'api-outputs']],
    ['GET', ['poll-architect', ANY, 'result']],
    ['POST', ['create']],
    ['POST', ['architect']],
    ['POST', ['cloudfront-signed-url']],
    ['POST', ['update-name', ANY]],
    ['POST', ['update-category', ANY]],
    ['POST', [ANY, 'api-execute']],
    ['POST', [ANY, 'thumbnail']],
    ['POST', [ANY, 'run']],
    ['POST', ['workflow', ANY, 'publish']],
    ['POST', ['workflow', ANY, 'template']],
    ['POST', [ANY, 'node', ANY, 'run']],
    ['DELETE', ['delete-workflow-def', ANY]],
    ['DELETE', ['node-run', ANY]],
  ],
};

// These upstream calls incur provider cost but have no user-credit reservation.
const BILLED_MATCHERS = {
  [PROXY_SCOPE.AGENTS]: [
    ['POST', ['by-slug', ANY, 'chat']],
    ['POST', ['by-slug', ANY, 'preview-realign']],
    ['POST', ['suggest']],
    ['POST', []],
  ],
  [PROXY_SCOPE.WORKFLOW]: [
    ['POST', [ANY, 'run']],
    ['POST', [ANY, 'node', ANY, 'run']],
    ['POST', [ANY, 'api-execute']],
    ['POST', ['architect']],
    ['POST', ['create']],
  ],
  [PROXY_SCOPE.APP]: [],
};

const RESERVED_SEGMENTS = {
  [PROXY_SCOPE.AGENTS]: new Set(['chat', 'like', 'preview-realign', 'profile', 'skills', 'suggest']),
};

function matchesRule(ruleSegments, segments, reserved) {
  return ruleSegments.length === segments.length
    && ruleSegments.every((rs, i) => rs === ANY
      ? (Boolean(segments[i]) && !reserved?.has(segments[i]))
      : rs === segments[i]);
}

/**
 * Determine whether a scoped upstream request is safe to proxy.
 * Provider-billed calls stay closed until they reserve and settle user credits.
 */
export function authorizeScopedProxyPath(scope, pathSegments, method = 'GET') {
  const upper = String(method).toUpperCase();
  const rules = PROXY_ALLOW_RULES[scope];
  const segments = (pathSegments || []).map((s) => String(s).toLowerCase());
  const path = `/${segments.join('/')}`;
  if (!rules) return { allow: false, decision: POLICY.DENY_PATH, path };

  const reserved = RESERVED_SEGMENTS[scope];
  const allowed = rules.some(([m, rs]) => m === upper && matchesRule(rs, segments, reserved));
  if (!allowed) return { allow: false, decision: POLICY.DENY_PATH, path };

  const billed = (BILLED_MATCHERS[scope] || []).some(([m, rs]) => m === upper && matchesRule(rs, segments, reserved));
  if (billed) return { allow: false, decision: POLICY.DENY_BILLING_REQUIRED, path, billed: true };
  return { allow: true, decision: POLICY.ALLOW_UTILITY, path, billed: false };
}

/**
 * Decide which paths the generic MuAPI proxy can serve.
 * Inference must use /api/generations so the server reserves and settles credits.
 */
export function classifyProxyRequest(pathSegments, method = 'GET', { isKnownGenerationEndpoint } = {}) {
  const path = (pathSegments || []).join('/');
  if (!pathSegments?.length) return { allow: false, decision: POLICY.DENY_PATH, path };

  if (DENIED_FIRST_SEGMENTS.has(first(pathSegments))) {
    return { allow: false, decision: POLICY.DENY_ACCOUNT, path };
  }

  if (String(method).toUpperCase() === 'GET') {
    // Owned gen_* tasks are handled locally by the route before this policy.
    // Never use the platform key to poll an arbitrary upstream request ID.
    if (isPredictionPoll(pathSegments)) return { allow: false, decision: POLICY.DENY_PATH, path };
    if (isEstimateCost(pathSegments)) return { allow: true, decision: POLICY.ALLOW_ESTIMATE, path };
    return { allow: false, decision: POLICY.DENY_PATH, path };
  }

  if (String(method).toUpperCase() === 'POST') {
    if (UTILITY_POST_PATHS.has(path)) return { allow: true, decision: POLICY.ALLOW_UTILITY, path };
    if (pathSegments.length === 1 && typeof isKnownGenerationEndpoint === 'function'
      && isKnownGenerationEndpoint(path)) {
      return { allow: false, decision: POLICY.DENY_BILLING_REQUIRED, path };
    }
    return { allow: false, decision: POLICY.DENY_PATH, path };
  }

  return { allow: false, decision: POLICY.DENY_PATH, path };
}
