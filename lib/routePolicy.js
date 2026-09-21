/**
 * 路由策略声明 —— docs/route-map.md 里"推不出来"的那一半。
 *
 * 文件系统能回答"这条 URL 存在吗"，回答不了"谁能进"：守卫可能藏在客户端组件里，
 * grep 看不见。所以每条页面路由必须命中下面某一条策略，命中不了就判红，
 * 逼新页面在提交时做一次明确决定，而不是默认公开。
 *
 * 匹配的是**去语言前缀后的基路径**：/zh/credits 与 /credits 是同一个面，
 * 差别只在"这个前缀下真的建树了吗"，那一列由脚本从文件系统推导。
 *
 * 零 import：生成脚本、P0 测试与服务端路由三边都要加载它。
 * lib/locales.js 直链 messages/*.json，纯 node 下 import 会崩，所以这里不引用它。
 */

/** 服务端进入条件。`client` 是诚实记录：服务端不查，登录态由客户端组件自己决定。 */
export const AUTH_LEVELS = ['public', 'session', 'onboarding', 'admin', 'redirect', 'client'];

/**
 * 有序、首个命中即生效。放最后一条 `/**` 是因为它会把任何新无前缀页面
 * 悄悄吞成"跳转类"，所以那条策略用 onlyFiles 钉死到具体文件上。
 */
export const ROUTE_POLICIES = [
  {
    match: '/admin/forbidden',
    auth: 'public',
    index: 'none',
    note: '权限拒绝页自己不能再被守卫拦；tests/p4/admin-operations.test.mjs 记录了这条豁免',
  },
  {
    match: '/admin/**',
    auth: 'admin',
    index: 'none',
    note: 'app/admin/layout.js 会话闸门 + 每页 requireAdminPagePermission 权限闸门',
  },
  {
    match: '/onboarding',
    auth: 'session',
    index: 'none',
    note: '无会话 redirect /；已完成者 redirect 进 studio',
  },
  {
    match: '/studio/**',
    auth: 'onboarding',
    index: 'index',
    note: '三处 studio 入口各自 await assertOnboardingComplete()；匿名放行，只挡未完成引导的用户',
  },
  { match: '/account', auth: 'redirect', index: 'none', note: '无条件 redirect /studio?account=open' },
  { match: '/assets', auth: 'redirect', index: 'none', note: '旧别名，redirect 进 studio 根' },
  { match: '/assistant', auth: 'redirect', index: 'none', note: '旧别名，redirect 进 studio' },
  { match: '/subscription', auth: 'redirect', index: 'none', note: '旧别名，redirect 进 /pricing' },
  { match: '/agents/**', auth: 'redirect', index: 'none', note: '5 个页面全是 /studio/agents* 的跳转' },
  { match: '/', auth: 'redirect', index: 'index', note: '按 cookie/header 语言 redirect 到 {rootPath}/studio' },
  { match: '/credits', auth: 'client', index: 'index', note: '服务端零检查，客户端 fetch /api/auth/me；正文目前仍是硬编码中文' },
  { match: '/benefits', auth: 'client', index: 'index', note: '硬币权益页：匿名可看目录，兑换与明细在客户端各自查会话' },
  { match: '/creations', auth: 'client', index: 'index', note: '服务端零检查，客户端决定登录态' },
  { match: '/community/**', auth: 'public', index: 'index', note: '游客可浏览；发帖接口各自查会话' },
  { match: '/pricing', auth: 'public', index: 'index', note: '正文硬编码中文，无 locale prop' },
  {
    match: '/call-api',
    auth: 'public',
    index: 'none',
    note: '营销落地页，零入链；正文硬编码中文，爬到了也没有对应语言版本',
  },
  {
    match: '/design-system',
    auth: 'public',
    index: 'none',
    note: '内部组件画廊，零入链、无鉴权，公开可爬所以必须 noindex',
  },
  { match: '/workflow/**', auth: 'client', index: 'none', note: '渲染 StandaloneShell 但不传 locale，今天恒为英文壳' },
  { match: '/u/**', auth: 'public', index: 'index', note: '公开主页 getPublicProfile' },
  { match: '/privacy', auth: 'public', index: 'index', note: '仅简体中文文案，无前缀语言变体' },
  { match: '/terms', auth: 'public', index: 'index', note: '仅简体中文文案' },
  { match: '/refund', auth: 'public', index: 'index', note: '仅简体中文文案' },
  { match: '/content-policy', auth: 'public', index: 'index', note: '仅简体中文文案，被三份法务页链入' },
  {
    match: '/**',
    auth: 'redirect',
    index: 'none',
    onlyFiles: ['app/[locale]/[...slug]/page.js'],
    note: '语言前缀兜底：别名 308 规范化，前缀下没有的路径 307 回无前缀，都不存在则 notFound',
  },
];

/**
 * 每个语言前缀下**真实建了树**的子路径。运行时用它决定"能不能就地服务"，
 * P0 闸门用它对文件系统求差 —— 加一页 app/zh/foo 而忘了同步这里会判红。
 */
export const LOCALIZED_PATHS = {
  '/zh': ['assistant', 'benefits', 'call-api', 'credits', 'pricing', 'studio', 'subscription'],
};

/**
 * `app/[locale]/**` 自己服务得起来的基路径：这些段对**全部**已注册前缀都能解析，
 * 不会因为某个前缀没建字面树就 404。语言切换据此决定"切过去"还是"留下并换 cookie"。
 */
export const PREFIX_AGNOSTIC_BASES = ['studio'];

/**
 * 无前缀树里真实存在的顶层段，即 `/zh/x` 可以安全降级成 `/x` 的那些 x。
 * 故意不含 `api` 与 `uploads`：那是带鉴权/文件读的处理器，
 * 不该被一个语言前缀悄悄重路由过去。
 */
export const UNPREFIXED_TOP_SEGMENTS = [
  'account', 'admin', 'agents', 'assets', 'assistant', 'benefits', 'call-api', 'community',
  'content-policy', 'creations', 'credits', 'design-system', 'login', 'onboarding',
  'pricing', 'privacy', 'refund', 'studio', 'subscription', 'terms', 'u', 'workflow',
];

/** `/studio/<段>` 允许的工作台 id，与 components/StandaloneShell.js 的 TABS 同源。 */
export const STUDIO_TABS = [
  'image', 'headshot', 'layers', 'video', 'audio', 'clipping', 'motion-control',
  'vibe-motion', 'lipsync', 'body-swap', 'cinema', 'marketing', 'workflows',
  'agents', 'design-agent', 'apps', 'ai-influencer',
];

/** TABS 之外、getInitialTab 用关键词识别的段（单数 workflow 指向 workflows 页签）。 */
export const STUDIO_ROUTE_KEYWORDS = ['workflow'];

/**
 * 免会话的接口、带签名校验的回调、以及转发到上游的捕获式代理。
 * 三张名单都要与 app/api/ 树逐项相等 —— 脚本正反两向都判红，
 * 所以"它其实免鉴权"这件事不能靠回忆，只能靠这里写没写。
 * 写法与生成器同源：捕获段写 `*`，具名动态段写 `[provider]`。
 */
export const API_POLICIES = {
  public: [
    '/api/auth/login', '/api/auth/register', '/api/auth/logout', '/api/auth/me',
    '/api/auth/social-options', '/api/auth/oauth/[provider]',
    '/api/auth/oauth/[provider]/callback', '/api/auth/phone/send-code', '/api/auth/phone/verify',
    '/api/billing/plans', '/api/billing/credit-packs',
    '/api/site/branding', '/api/site/content-config', '/api/site/subscription-faq',
    '/api/i18n', '/api/models/active', '/api/health', '/api/live',
    '/api/ready', '/api/analytics/track', '/api/analytics/banner-event',
  ],
  signature: [
    '/api/billing/webhooks/stripe', '/api/billing/webhooks/alipay',
    '/api/billing/webhooks/wechat', '/api/generations/[id]/callback',
  ],
  /** 遗留代理：迁移目标是收敛到 POST /api/generations；/api/api/v1 是 Studio 现在真实的生成链路。 */
  legacyProxy: [
    '/api/api/v1/*', '/api/v1/*', '/api/v1/creative-agent/*',
    '/api/agents/*', '/api/app/*', '/api/workflow/*',
  ],
};

/** 生成文档里"服务器 A 边缘层"一节的手写事实；脚本只搬运不推导。 */
export const EDGE_NOTES = [
  '入口只有 www.koyosim.com（go 域名按决定停用）；nginx 反代到 127.0.0.1:3100 的 `next start`。',
  'worker 是独立服务 koyosim-worker.service（scripts/generation-worker.mjs）。',
  'middleware.js 在中国大陆 IP 门禁命中时直接返回 403，不进入任何页面路由。',
  'public/robots.txt：Allow: /，Disallow: /admin/ 与 /api/；无 Sitemap 行。',
  'public/ 下的静态文件由 Next 先于 app/uploads/[...path] 服务，两条路径共存。',
];

/**
 * 命中判断：`*` 恰好一段，`**` 零或多段（只会出现在末尾）。
 * 路由的 URL 段里 `[x]`/`[...x]`/`[[...x]]` 已分别归一成 `*`/`*`/`**`。
 */
export function matchRoute(pattern, segments) {
  const parts = pattern.split('/').filter(Boolean);
  for (let i = 0; i < parts.length; i += 1) {
    if (parts[i] === '**') return true;
    if (i >= segments.length) return false;
    if (parts[i] !== '*' && parts[i] !== segments[i]) return false;
  }
  return parts.length === segments.length;
}

const LOCALE_SEGMENT = new Set(['[locale]', 'en', 'zh', 'zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'es']);

/**
 * app/ 下的路径段 → URL 段序列，以及去掉语言前缀后的基路径段。
 * 语言段统一成 `:loc`，这样 /zh/credits 与 /credits 归到同一条策略。
 */
export function describeSegments(dirSegments) {
  const url = dirSegments.map((s) => {
    if (s === '[locale]') return ':loc';
    if (LOCALE_SEGMENT.has(s)) return ':loc';
    if (s.startsWith('[[...') && s.endsWith(']]')) return '**';
    if (s.startsWith('[...') || s.startsWith('[')) return '*';
    return s;
  });
  const params = dirSegments.filter((s) => s.startsWith('['));
  const base = url[0] === ':loc' ? url.slice(1) : url;
  return { url, base, params };
}

/** 一条路由解析到哪条策略；`/**` 之外的 onlyFiles 不参与，避免兜底吞掉新页面。 */
export function resolvePolicy(baseSegments) {
  for (const policy of ROUTE_POLICIES) {
    if (matchRoute(policy.match, baseSegments) && !policy.onlyFiles) return policy;
  }
  for (const policy of ROUTE_POLICIES) {
    if (matchRoute(policy.match, baseSegments)) return policy;
  }
  return null;
}
