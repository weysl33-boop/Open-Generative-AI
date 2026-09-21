#!/usr/bin/env node
/**
 * 路由清单生成器 —— docs/route-map.md 的机械那一半。
 *
 * 写一份路由文档的难点不是写，是它三周后就错了。所以这份文档不手写：
 * 每条页面路由、布局链、错误边界、跳转目标、语言可达性都从 app/ 树推导，
 * tests/p0/route-manifest.test.mjs 再拿同一批推导函数当闸门用。
 * 改了路由没改声明，这里就判红，而不是留着一份好看的假文档。
 *
 *   node scripts/route-map.mjs              # 写 docs/route-map.md
 *   node scripts/route-map.mjs --check      # CI：文档过期或有硬违规就非零退出
 *   node scripts/route-map.mjs --report     # 只打印违规，恒零退出
 *   node scripts/route-map.mjs --update     # 重记棘轮基线（批准过的迁移之后用）
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  API_POLICIES,
  AUTH_LEVELS,
  EDGE_NOTES,
  LOCALIZED_PATHS,
  PREFIX_AGNOSTIC_BASES,
  ROUTE_POLICIES,
  STUDIO_ROUTE_KEYWORDS,
  STUDIO_TABS,
  UNPREFIXED_TOP_SEGMENTS,
  describeSegments,
  matchRoute,
  resolvePolicy,
} from '../lib/routePolicy.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const APP = join(ROOT, 'app');
const DOC = join(ROOT, 'docs', 'route-map.md');
const BASELINE = join(ROOT, 'scripts', 'route-baseline.json');
const GENERATOR = 'scripts/route-map.mjs';

const SOURCE_DIRS = ['app', 'components', 'lib'];
/**
 * 顶层段里**不能**被语言前缀降级过去的那些：前两者是带鉴权/文件读的处理器，
 * `auth` 下今天只有 route.js（没有 page.js），所以 `/zh/auth/x` 一旦 307 到
 * `/auth/x` 就是 404 → 必须直接 notFound，而不是假装可重定向。
 */
const API_ONLY_TOP_SEGMENTS = ['api', 'uploads', 'auth'];
/**
 * 反空断言的下限。数字来自 2026-09-21 的实际清点（75 页 / 149 个 route.js），
 * 故意留了余量：它的用途不是"卡新增"，而是"扫描逻辑一旦失效就立刻炸"，
 * 因为正则读空时上面所有 for 循环都会空跑并报告全绿。
 */
export const MIN_PAGE_ROUTES = 70;
export const MIN_API_ROUTES = 120;
const SKIP_DIRS = new Set([
  'node_modules', '.next', '.agents', '.git', 'dist', 'build', 'out', 'public',
  'release-staging', '.qoder', 'coverage', 'messages',
]);

function rel(path) {
  return relative(ROOT, path).replace(/\\/g, '/');
}

function read(path) {
  return readFileSync(path, 'utf8');
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(entry)) walk(full, out);
      continue;
    }
    if (/\.(js|jsx|mjs)$/.test(entry)) out.push(full);
  }
  return out;
}

/**
 * 把 lib/locales.js 当文本读：它直链 messages/*.json，纯 node 下 import 不进来。
 * 读到 0 条比读到错的条数更危险（正则失效会伪装成"这站只有一个语言"），
 * 所以这里直接抛，而不是返回一个空集合让下游空跑。
 */
export const EXPECTED_LOCALE_CODES = ['en', 'zh-CN', 'ja-JP', 'ko-KR', 'zh-TW', 'es'];

export function readLocaleRegistry() {
  const src = read(join(ROOT, 'lib', 'locales.js'));
  const codes = [...src.matchAll(/^ {4}code: '([^']*)',$/gm)].map((m) => m[1]);
  const rootPaths = [...src.matchAll(/^ {4}rootPath: '([^']*)',$/gm)].map((m) => m[1]);
  if (codes.join(',') !== EXPECTED_LOCALE_CODES.join(',')) {
    throw new Error(
      `lib/locales.js 读到的 code 序列是 [${codes.join(',')}]，应为 [${EXPECTED_LOCALE_CODES.join(',')}]：` +
        '正则与注册表格式脱节，继续跑会把语言面读空并报告全绿',
    );
  }
  const configs = codes.map((code, i) => ({ code, rootPath: rootPaths[i] ?? '' }));
  const block = src.slice(
    src.indexOf('export const LOCALE_ALIASES'),
    src.indexOf('};', src.indexOf('export const LOCALE_ALIASES')),
  );
  const aliases = {};
  for (const m of block.matchAll(/^\s*'?([\w-]+)'?:\s*'([^']+)'/gm)) {
    (aliases[m[2]] ||= []).push(m[1]);
  }
  return { configs, aliases, codes };
}

function dirEntries(dir) {
  return readdirSync(dir).filter((e) => !e.startsWith('.'));
}

/**
 * 从一段字面量数组源码里抽出字符串项。`byLine` 给对象数组用（只认 `id: 'x'`，
 * 否则会连 `label:` 一起吞），否则给纯字符串数组用。
 * 正文按括号配平截取而不是找换行 —— `Object.freeze(['workflow'])` 整条就占一行。
 * 找不到标记就返回空数组，让调用方去判"表读空了"，不要在这里猜。
 */
function literalIdsFromArray(src, marker, { byLine = false } = {}) {
  const at = src.indexOf(marker);
  if (at < 0) return [];
  const start = at + marker.length - 1;
  let depth = 0;
  let end = -1;
  for (let i = start; i < src.length; i += 1) {
    if (src[i] === '[') depth += 1;
    else if (src[i] === ']' && --depth === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) return [];
  const body = src.slice(start, end);
  const re = byLine ? /^\s*(?:id:\s*)?'([^']+)'/gm : /'([^']+)'/g;
  return [...body.matchAll(re)].map((m) => m[1]);
}

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

function exportsMethod(src, method) {
  return new RegExp(
    `export\\s+(?:async\\s+)?function\\s+${method}\\b|export\\s+const\\s+${method}\\b`,
  ).test(src);
}

/**
 * API 段 → URL。具名动态段保留原样（声明里写的就是 `[provider]`），
 * 只有捕获段收敛成 `*`，否则 `[[...path]]` 与 `[...path]` 会在文档里长得不一样。
 */
function apiUrl(segs) {
  return `/${segs.map((s) => (s.startsWith('[...') || s.startsWith('[[') ? '*' : s)).join('/')}`;
}

/**
 * 一个 route.js 的安全事实。`clientUserId` 是"把请求体里的 userId 当身份"这一类
 * 伪造面的粗筛，宁可多报让人去看一眼；闸门只要求它的计数为零。
 */
function securityFacts(src) {
  const methods = HTTP_METHODS.filter((m) => exportsMethod(src, m));
  return {
    methods,
    mutating: methods.some((m) => !['GET', 'HEAD', 'OPTIONS'].includes(m)),
    guardMutation: /guardMutation\(/.test(src),
    requirePermission: /requirePermission\(/.test(src),
    sameOriginOnly: /guardSameOrigin\(/.test(src),
    rateLimited: /consumeRateLimit\(/.test(src),
    clientUserId:
      /userId:\s*(?:body|payload|data|parsed|req\.body)\b/.test(src) ||
      (/userId:\s*\w+\.(?:userId|user_id)\b/.test(src)
        && /const\s+\{[^}]*userId[^}]*\}\s*=\s*(?:await\s+)?request/.test(src)),
  };
}

/**
 * 扫一遍 app/ 树，产出页面路由与处理器路由两份记录 + 特殊文件索引。
 * 布局/错误边界/404 采用"就近向上找"，与 Next 的分段继承一致。
 */
export function collectRoutes() {
  const registry = readLocaleRegistry();
  const pages = [];
  const handlers = [];
  const special = { layouts: [], errors: [], notFounds: [], globals: [] };

  const visit = (dirPath, dirSegments) => {
    const entries = dirEntries(dirPath);
    const has = (name) => entries.includes(name);
    const pageFile = entries.find((e) => e === 'page.js' || e === 'page.jsx');
    const routeFile = has('route.js') ? 'route.js' : null;

    if (has('layout.js')) special.layouts.push(rel(join(dirPath, 'layout.js')));
    if (has('error.js')) special.errors.push(rel(join(dirPath, 'error.js')));
    if (has('not-found.js')) special.notFounds.push(rel(join(dirPath, 'not-found.js')));
    if (has('global-error.js')) special.globals.push(rel(join(dirPath, 'global-error.js')));

    const record = (fileName, kind) => {
      const filePath = join(dirPath, fileName);
      const src = read(filePath);
      const { url, base, params } = describeSegments(dirSegments);
      const chain = [];
      for (let i = 0; i <= dirSegments.length; i += 1) {
        const probe = i === 0 ? APP : join(APP, ...dirSegments.slice(0, i));
        if (existsSync(join(probe, 'layout.js'))) chain.push(i === 0 ? 'app/layout.js' : rel(join(probe, 'layout.js')));
      }
      let errorBoundary = null;
      let notFoundBoundary = null;
      for (let i = dirSegments.length; i >= 0 && !(errorBoundary && notFoundBoundary); i -= 1) {
        const probe = i === 0 ? APP : join(APP, ...dirSegments.slice(0, i));
        if (!errorBoundary && existsSync(join(probe, 'error.js'))) {
          errorBoundary = i === 0 ? 'app/error.js' : rel(join(probe, 'error.js'));
        }
        if (!notFoundBoundary && existsSync(join(probe, 'not-found.js'))) {
          notFoundBoundary = i === 0 ? 'app/not-found.js' : rel(join(probe, 'not-found.js'));
        }
      }
      const redirects = [...src.matchAll(/\b(permanentRedirect|redirect)\(\s*[`'"]([^`'"]*)[`'"]/g)]
        .map((m) => ({ kind: m[1], target: m[2] }));
      const dynamicInterpolated = /\b(permanentRedirect|redirect)\(\s*`[^`]*\$\{/.test(src);
      // noindex 会从 layout 继承（app/admin/layout.js 就是这么关掉整片的），
      // 只看页面自己写没写会把 30 个后台页误报成债务。
      const robotsOff = (text) => /robots:\s*\{[^}]*index:\s*false/.test(text);
      return {
        kind,
        file: rel(filePath),
        ...(kind === 'handler' ? securityFacts(src) : {}),
        url: kind === 'handler' ? apiUrl(dirSegments) : urlToPath(url),
        base,
        params,
        segs: dirSegments,
        locales: dirSegments[0] === '[locale]' ? ':param' : dirSegments[0] === 'zh' ? 'literal' : 'none',
        policy: resolvePolicy(base),
        layouts: chain,
        errorBoundary,
        notFoundBoundary,
        forceDynamic: /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/.test(src),
        noIndex: robotsOff(src) || chain.some((f) => robotsOff(read(join(ROOT, f)))),
        redirects,
        dynamicInterpolated,
        readsCookies: /\bcookies\(\)/.test(src),
        readsHeaders: /\bheaders\(\)/.test(src),
      };
    };

    if (pageFile) pages.push(record(pageFile, 'page'));
    if (routeFile) handlers.push(record(routeFile, 'handler'));
    for (const entry of entries) {
      const full = join(dirPath, entry);
      if (!statSync(full).isDirectory()) continue;
      if (entry === 'api') {
        visitApi(full, ['api']);
        continue;
      }
      visit(full, [...dirSegments, entry]);
    }
  };

  const visitApi = (dirPath, segs) => {
    for (const entry of dirEntries(dirPath)) {
      const full = join(dirPath, entry);
      if (statSync(full).isDirectory()) {
        visitApi(full, [...segs, entry]);
        continue;
      }
      if (entry !== 'route.js') continue;
      handlers.push({
        ...securityFacts(read(full)),
        kind: 'api',
        file: rel(full),
        url: apiUrl(segs),
        segs,
        admin: segs[1] === 'admin',
      });
    }
  };

  visit(APP, []);
  return { pages, handlers, special, registry };
}

function urlToPath(urlSegments) {
  if (!urlSegments.length) return '/';
  return `/${urlSegments
    .map((s) => (s === '**' ? '{**}' : s === '*' ? '{*}' : s))
    .join('/')}`;
}

/** 每个注册前缀在当前文件系统下真的能解析出哪些路由。 */
export function localeReachability({ pages, registry }) {
  const literalDirs = new Set(dirEntries(APP).filter((e) => !e.startsWith('[') && !e.includes('.')));
  return registry.configs.map(({ code, rootPath }) => {
    const dirName = rootPath.replace(/^\//, '');
    const hasTree = Boolean(dirName) && literalDirs.has(dirName);
    const concrete = pages.filter((p) => (hasTree ? p.file.startsWith(`app/${dirName}/`) : false));
    const viaDynamic = pages.filter((p) => p.file.startsWith('app/[locale]/'));
    const aliasUrls = [];
    if (code !== 'en') {
      const canonical = rootPath.replace(/^\//, '');
      for (const alias of registry.aliases[code] || []) {
        if (alias !== canonical) aliasUrls.push(`/${alias}`);
      }
      if (canonical !== code) aliasUrls.push(`/${code}`);
    }
    return {
      code,
      rootPath,
      hasTree,
      ownRoutes: hasTree ? concrete.length : viaDynamic.length,
      servedBy: hasTree ? `app/${dirName}/**` : viaDynamic.length ? 'app/[locale]/**' : '（无树）',
      aliasUrls: [...new Set(aliasUrls)],
      rootResolves: existsSync(join(APP, hasTree ? dirName : '[locale]', 'page.js')),
      studioResolves:
        hasTree
          ? existsSync(join(APP, dirName, 'studio'))
          : existsSync(join(APP, '[locale]', 'studio')),
    };
  });
}

/**
 * app/[locale]/[...slug] 决定"降级还是 404"时依赖的两张表，必须与文件系统一致。
 * 可降级段按**能不能 GET 到**算（页面或带 GET 的 route.js），不是按目录名算 ——
 * `app/login/` 只有一个 route.js，`app/auth/` 只有回调，两者的可用性不一样。
 */
export function declarationDrift(data) {
  const dirs = (p) => statSync(p).isDirectory();
  const literalTop = dirEntries(APP).filter((e) => !e.startsWith('[') && dirs(join(APP, e)));
  // 语言根目录以注册表为准：新增一个前缀树而注册表里没有它，或反过来，都要被发现。
  const roots = new Set(
    data.registry.configs
      .map((c) => c.rootPath.replace(/^\//, ''))
      .filter(Boolean),
  );
  const live = new Set();
  for (const route of [...data.pages, ...data.handlers]) {
    if (route.kind !== 'page' && !route.methods.includes('GET')) continue;
    const top = route.segs[0];
    if (top && !top.startsWith('[')) live.add(top);
  }
  const redirectable = [...live]
    .filter((e) => !API_ONLY_TOP_SEGMENTS.includes(e) && !roots.has(e))
    .sort();
  const localized = {};
  for (const entry of literalTop) {
    if (!roots.has(entry)) continue;
    const dir = join(APP, entry);
    localized[`/${entry}`] = dirEntries(dir).filter((e) => dirs(join(dir, e))).sort();
  }
  // app/[locale] 下真的建了目录的那些段，对全部前缀都可解析 —— 切换器据此决定导航还是留下。
  const prefixAgnostic = dirEntries(join(APP, '[locale]'))
    .filter((e) => !e.startsWith('[') && dirs(join(APP, '[locale]', e)))
    .sort();
  const tabSrc = read(join(ROOT, 'components', 'StandaloneShell.js'));
  const tabs = literalIdsFromArray(tabSrc, 'const TABS = [', { byLine: true });
  // 三份同一张表：声明（闸门读它）、服务端路由校验（lib/studio-routes.js）、客户端壳。
  // 少比一份，就会有一处悄悄多出一个段而闸门全绿。
  const slugSrc = existsSync(join(ROOT, 'lib', 'studio-routes.js'))
    ? read(join(ROOT, 'lib', 'studio-routes.js'))
    : '';
  const slugIds = literalIdsFromArray(slugSrc, 'export const STUDIO_TAB_IDS = Object.freeze([');
  const slugAlias = literalIdsFromArray(slugSrc, 'export const STUDIO_ALIAS_SEGMENTS = Object.freeze([');
  return {
    unprefixed: { declared: [...UNPREFIXED_TOP_SEGMENTS].sort(), actual: redirectable.sort() },
    localized: Object.fromEntries(
      Object.entries(localized).map(([prefix, dirs]) => [
        prefix,
        { declared: [...(LOCALIZED_PATHS[prefix] || [])].sort(), actual: dirs },
      ]),
    ),
    tabs: { declared: [...STUDIO_TABS].sort(), actual: [...tabs].sort() },
    prefixAgnostic: { declared: [...PREFIX_AGNOSTIC_BASES].sort(), actual: prefixAgnostic },
    // 文件还不存在时给 null，让审计跳过这一腿，而不是把"别人还没写完"判成我的红。
    slugTabs: { declared: [...STUDIO_TABS].sort(), actual: slugSrc ? [...slugIds].sort() : null },
    slugKeywords: {
      declared: [...STUDIO_ROUTE_KEYWORDS].sort(),
      actual: slugSrc ? [...slugAlias].sort() : null,
    },
    tabKeywords: STUDIO_ROUTE_KEYWORDS,
  };
}

/**
 * 违规收集。`hard` 必须为零，任何时刻都不许有；`ratchet` 是存量债务的计数，
 * 只许降不许升，降完就 `--update` 锁死 —— 所以"这条规则今天还做不到"不能变成
 * "这条规则永远不做"。
 */
export function audit(data) {
  const { pages, handlers, special } = data;
  const hard = [];
  const ratchet = {};
  const rawLocaleRedirect = [];
  const deadPolicies = [];
  const missingNoIndex = [];

  for (const policy of ROUTE_POLICIES) {
    if (!AUTH_LEVELS.includes(policy.auth)) hard.push(`策略 ${policy.match} 的 auth "${policy.auth}" 不在 AUTH_LEVELS 里`);
    if (!policy.note) hard.push(`策略 ${policy.match} 缺 note：蓝图的每一行都要说清为什么`);
  }
  const used = new Set(pages.map((p) => p.policy?.match).filter(Boolean));
  for (const policy of ROUTE_POLICIES) {
    if (!used.has(policy.match)) deadPolicies.push(policy.match);
  }

  for (const page of pages) {
    if (!page.policy) {
      hard.push(`${page.file} (${page.url}) 没有命中任何路由策略：新页面必须显式声明谁能进`);
      continue;
    }
    if (page.policy.onlyFiles && !page.policy.onlyFiles.includes(page.file)) {
      hard.push(`${page.file} 只命中了兜底策略 ${page.policy.match}，必须为它单独声明进入条件`);
    }
    // 纯跳转页（auth: 'redirect'）返回的是 303，没有可索引的正文，robots 写了也是冗余 ——
    // 这条规则针对的是"渲染了内容却允许被爬"的那些。
    if (page.policy.index === 'none' && !page.noIndex && page.policy.auth !== 'redirect') {
      missingNoIndex.push(page.file);
    }
    for (const { kind, target } of page.redirects) {
      // 模板串里的目标今天只能靠下面那条 `${locale}` 专项规则管，这里跳过以免重复报同一件事。
      if (!target.startsWith('/') || target.startsWith('//') || target.includes('${')) continue;
      const targetBase = describeSegments(
        target.split('?')[0].split('#')[0].split('/').filter(Boolean),
      ).base;
      if (!targetBase.length) continue;
      const ok = pages.some((p) => matchRoute(`/${p.base.join('/')}`, targetBase));
      if (!ok) hard.push(`${page.file} 用 ${kind}() 跳到 ${target}，但清单里没有这条路由`);
    }
    if (page.file.startsWith('app/[locale]/') && /redirect\(\s*`\$\{locale\}|\/\$\{locale\}/.test(read(join(ROOT, page.file)))) {
      rawLocaleRedirect.push(page.file);
    }
  }
  // 存量四处债务走棘轮而不是硬闸门：S0 提交时它们还在（基线=1），S1/S3 逐条清零并锁死。
  // 计数只许降，所以"顺手再加一处"照样判红，而共享工作树不会被一次切片卡住。
  ratchet['locale-param-in-redirect'] = rawLocaleRedirect;
  ratchet['unhit-route-policy'] = deadPolicies;
  ratchet['noindex-required-missing'] = missingNoIndex;

  ratchet['missing-root-not-found'] = special.notFounds.includes('app/not-found.js')
    ? []
    : ['app/not-found.js 不存在：除 /admin 外整站的 404 都在用 Next 默认页（无品牌、无语言）'];

  const drift = declarationDrift(data);
  const driftLegs = [
    ['UNPREFIXED_TOP_SEGMENTS', drift.unprefixed],
    ['STUDIO_TABS', drift.tabs],
    ['PREFIX_AGNOSTIC_BASES', drift.prefixAgnostic],
    ...Object.entries(drift.localized).map(([p, v]) => [`LOCALIZED_PATHS${p}`, v]),
  ];
  if (drift.slugTabs.actual) {
    driftLegs.push(['lib/studio-routes.js STUDIO_TAB_IDS', drift.slugTabs]);
    driftLegs.push(['lib/studio-routes.js STUDIO_ALIAS_SEGMENTS', drift.slugKeywords]);
  }
  for (const [key, { declared, actual }] of driftLegs) {
    const missing = actual.filter((x) => !declared.includes(x));
    const stale = declared.filter((x) => !actual.includes(x));
    if (missing.length) hard.push(`${key} 有 ${missing.length} 项没登记进 lib/routePolicy.js：${missing.join(', ')}`);
    if (stale.length) hard.push(`lib/routePolicy.js 的 ${key} 有多余项：${stale.join(', ')}`);
  }
  for (const registry of data.registry.configs) {
    if (!registry.rootPath) continue;
    const reach = data.reachability.find((r) => r.code === registry.code);
    if (reach && !reach.studioResolves) hard.push(`${registry.code} 的前缀 ${registry.rootPath}/studio 解析不到路由`);
  }

  // 声明过的公开/签名/代理接口必须真的存在：路由改名或删掉后，"它免鉴权"这条声明
  // 会留在 lib/routePolicy.js 里骗人，所以宁可判红。两侧写法同源 —— 捕获段一律 `*`、
  // 具名动态段保留 `[provider]` 原样，因此按字符串相等即可。
  const handlerUrls = new Set(handlers.map((h) => h.url));
  for (const [group, urls] of Object.entries(API_POLICIES)) {
    if (group === 'legacyProxy') continue;
    for (const url of urls) {
      if (!handlerUrls.has(url)) hard.push(`API_POLICIES.${group} 里的 ${url} 在 app/ 树里找不到对应 route.js`);
    }
  }
  // 反向：/api 下的捕获式路由整族都是"转发到上游"的口子，新增一条必须显式登记。
  for (const handler of handlers) {
    if (!handler.url.startsWith('/api/') || !handler.url.endsWith('/*')) continue;
    if (API_POLICIES.legacyProxy.includes(handler.url)) continue;
    hard.push(`${handler.file} 是捕获式代理，必须登记进 API_POLICIES.legacyProxy 并写明迁移目标`);
  }

  // 支付/生成回调由对端服务器直接 POST，同源检查会把它挡死，所以豁免的是
  // "已登记为签名校验"这一条，不是"看着像 webhook"这一条 —— 名单外的都要有 helper。
  const signed = new Set(API_POLICIES.signature);
  const unguarded = handlers.filter(
    (h) => h.mutating && !h.guardMutation && !h.requirePermission && !signed.has(h.url),
  );
  const spoofed = handlers.filter((h) => h.clientUserId);
  ratchet['api-mutation-without-guard'] = unguarded.map((h) => `${h.file} ${h.methods.join('/')}`);
  ratchet['api-mutation-without-rate-limit'] = handlers
    .filter((h) => h.mutating && !h.rateLimited && !h.admin)
    .map((h) => h.file);
  ratchet['api-spoofed-client-user-id'] = spoofed.map((h) => `${h.file} ${h.methods.join('/')}`);

  const sources = SOURCE_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
  const rawHrefs = [];
  const zhBranches = [];
  const topLevel = [...UNPREFIXED_TOP_SEGMENTS];
  const RAW_HREF = new RegExp(`href=["'\`]\\/(${topLevel.join('|')})(\\/|["'\`?])`, 'g');
  for (const file of sources) {
    const r = rel(file);
    const src = read(file);
    for (const m of src.matchAll(RAW_HREF)) {
      rawHrefs.push(`${r}:${src.slice(0, m.index).split('\n').length}`);
    }
    // 注册表与文案层按语言分支正是它们的职责（lib/locales.js 就是那棵树）；
    // 这条规则要管的是"共享组件里偷写 if (isZh)"。
    const copyLayer = r.startsWith('lib/');
    const onboardingScope = r.startsWith('components/onboarding/') || r === 'app/onboarding/page.js';
    if (!copyLayer && !onboardingScope && (/\bisZh\b/.test(src) || /locale\s*===\s*['"]zh['"]/.test(src) || /startsWith\(['"]zh/.test(src))) {
      zhBranches.push(r);
    }
  }
  ratchet['raw-unprefixed-href'] = rawHrefs;
  ratchet['locale-zh-branch-outside-onboarding'] = zhBranches;

  return { hard, ratchet, unguarded, drift };
}

function loadBaseline() {
  if (!existsSync(BASELINE)) return {};
  const parsed = JSON.parse(read(BASELINE));
  return parsed.counts || parsed;
}

/** 推导不出、也不该每次重写的那几行：一次请求的解析链路。 */
const PIPELINE = [
  'nginx（只监听 www.koyosim.com，反代 127.0.0.1:3100）',
  '→ middleware.js：中国大陆 IP 门禁 → **别名前缀 308 规范化**（`/ja/studio → /ja-JP/studio`、`/zh-CN/* → /zh/*`，先于语言判定）→ 语言判定（路径 → `?lang=` → cookie）→ 写 `x-locale` → 安全头 + CSP。缓存头按路径分：`/api/*` 与无扩展名路径 `no-store`，`/flags/*.svg`、`/robots.txt`、`/uploads/**` 这类静态资源交回默认。这里**没有任何鉴权**。',
  '→ app 树分段解析：静态段 > 动态段 `[locale]` > 捕获段；`app/zh/**` 这类字面目录永远优先于 `app/[locale]/**`。',
  '→ page.js 服务端守卫：`assertOnboardingComplete()` / `requireAdminPagePermission()`，或没有（见下表"进入条件"）。前缀下解析不到的路径由 `app/[locale]/[...slug]/page.js` 接手 —— 降级、或落到品牌化 404，不再软跳。',
  '→ error.js / not-found.js 边界（就近向上继承）；根 `app/not-found.js` 按 `x-locale` 出文案。',
];

export function renderMarkdown(data) {
  const { pages, handlers, special, reachability, audit: result } = data;
  const { drift, baseline = {} } = result;
  const list = (arr) => arr.map((x) => `\`${x}\``).join(' ');
  const boundary = (file) =>
    file ? `\`${file.replace(/^app\//, '').replace(/\/?error\.js$/, '') || '（根）'}\`` : '**无**';
  // 索引那一格说的是"策略要求"与"源码实际"是否一致：不一致就是 S1 要补的 noindex。
  const indexCell = (p) =>
    p.noIndex ? 'noindex' : p.policy?.index === 'none' ? '**该 noindex，源码未写**' : 'index';
  const lines = [
    `<!-- GENERATED BY ${GENERATOR} — 不要手改；改路由就改 lib/routePolicy.js 再跑 npm run route:map -->`,
    '',
    '# 路由架构蓝图',
    '',
    '这份文件由 `scripts/route-map.mjs` 从 `app/` 树推导，`tests/p0/route-manifest.test.mjs` 用同一批函数当闸门。',
    '能推导的（URL、布局链、错误边界、跳转目标、语言可达性）一律不手写；',
    '推不出来的（谁能进、该不该被索引、哪个接口免会话）写在 `lib/routePolicy.js`，两边对不上就判红。',
    '',
    '## 一次请求怎么解析',
    '',
    ...PIPELINE.map((s, i) => `${i + 1}. ${s}`),
    '',
    '## 语言前缀可达性',
    '',
    '注册表里 6 个语言码都"能解析"，但只有 `zh` 真建了树 —— 这就是 `/ja-JP/studio` 打得开、',
    '`/ja-JP/credits` 打得开的同一个原因：两者都由 `app/[locale]/**` 服务，与语言无关。',
    '「会造出重复 URL 的别名」那一列现在只是**曾经**可达：`middleware.js` 在语言判定之前把非规范前缀 308 到规范码，',
    '`/ja/studio` 与 `/ja-JP/studio` 不再是两个 URL。',
    '',
    '| 语言码 | 前缀 | 有独立路由树 | 服务它的目录 | 树内路由数 | 会造出重复 URL 的别名 |',
    '| --- | --- | --- | --- | --- | --- |',
    ...reachability.map((r) =>
      `| \`${r.code}\` | \`${r.rootPath || '（无前缀）'}\` | ${r.hasTree ? '是' : '否'} | \`${r.servedBy}\` | ${r.ownRoutes} | ${r.aliasUrls.map((u) => `\`${u}\``).join(' ') || '—'} |`,
    ),
    '',
    '## 带前缀路径的三种命运',
    '',
    '`app/[locale]/[...slug]/page.js` 按这个顺序判定，闸门拿同一批表求差：',
    `1. 别名/非规范码（\`ja\`、\`zh-CN\`、\`es-ES\`…）→ **308** 到规范前缀（正常由中间件先做掉，页面层留一条给 matcher 之外的入口）；`,
    `2. 该前缀下真建了树（或由 \`app/[locale]/**\` 服务：${list(drift.prefixAgnostic.declared)}）→ 就地渲染，永不走到这里；`,
    `3. 顶层段能 GET 到 → **307** 回无前缀（语言由 cookie 承载）：${list(drift.unprefixed.actual)}；`,
    '4. 都不满足 → **404**（品牌化 404 页，按 `x-locale` 出文案）。',
    '',
    `已本地化的前缀与子路径：${Object.entries(drift.localized)
      .map(([p, v]) => `\`${p}\` → ${list(v.actual)}`)
      .join('；') || '（仅 zh）'}`,
    '',
    '## 页面路由',
    '',
    '| URL | 文件 | 进入条件 | 索引 | dynamic | 布局链 | error 边界 | 404 边界 | 跳转 |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...pages.map((p) =>
      `| \`${p.url}\` | \`${p.file}\` | **${p.policy?.auth ?? '未声明'}** | ${indexCell(p)} | ${p.forceDynamic ? 'force-dynamic' : '—'} | ${p.layouts.length} | ${boundary(p.errorBoundary)} | ${p.notFoundBoundary ? '有' : '**无**'} | ${p.redirects.map((r) => `\`${r.target}\``).join(' ') || (p.dynamicInterpolated ? '动态' : '—')} |`,
    ),
    '',
    '## 路由策略（`lib/routePolicy.js`，首个命中生效）',
    '',
    '| 匹配 | 进入条件 | 索引 | 说明 |',
    '| --- | --- | --- | --- |',
    ...ROUTE_POLICIES.map((p) => `| \`${p.match}\` | ${p.auth} | ${p.index} | ${p.note} |`),
    '',
    '## 工作台段（`/studio/<段>`）',
    '',
    `路由层按 ${list(drift.tabs.declared.concat(drift.tabKeywords))} 判定，不在这张表里的段直接 404，`,
    '`/studio/任意乱码` 不再悄悄渲染图像工作台。这张表与 `components/StandaloneShell.js` 的 `TABS` 逐项相等，加页签不登记表就判红。',
    '',
    '## 特殊文件',
    '',
    `- 布局：${special.layouts.map((f) => `\`${f}\``).join(' ')}`,
    `- 错误边界：${special.errors.concat(special.globals).map((f) => `\`${f}\``).join(' ') || '（仅根）'}`,
    `- 404 页：${special.notFounds.map((f) => `\`${f}\``).join(' ') || '**只有 Next 默认页**'}`,
    '',
    '## API 路由',
    '',
    `- 处理器总数：${handlers.filter((h) => h.kind !== 'page').length}（其中 \`/api/**\` ${handlers.filter((h) => h.kind === 'api').length}，\`/api/admin/**\` ${handlers.filter((h) => h.admin).length} 个全部经 \`requirePermission\`）`,
    `- 免会话：${list(API_POLICIES.public)}`,
    `- 带签名校验（对端服务器直接 POST，所以不走同源检查）：${list(API_POLICIES.signature)}`,
    `- 遗留代理（迁移目标是收敛到 \`POST /api/generations\`）：${list(API_POLICIES.legacyProxy)}`,
    `- 变更型但缺 \`guardMutation\`：${result.unguarded.length ? list(result.unguarded.map((h) => h.file)) : '无'}`,
    '',
    '## 存量债务（棘轮，只许降不许升）',
    '',
    '`scripts/route-baseline.json` 记的是每条规则今天还剩多少；降了要 `npm run route:lint:update` 锁死，涨了 CI 就红。',
    '',
    '| 规则 | 基线 | 当前 |',
    '| --- | --- | --- |',
    ...Object.entries(result.ratchet).map(
      ([rule, hits]) => `| \`${rule}\` | ${baseline[rule] ?? '—'} | ${hits.length} |`,
    ),
    '',
    '## 服务器 A 边缘层',
    '',
    ...EDGE_NOTES.map((n) => `- ${n}`),
    '',
  ];
  return lines.join('\n');
}

/** 装配 + 判定。测试与 CLI 都走这里，避免两边各写一套"什么算违规"。 */
export function collect() {
  const data = collectRoutes();
  data.reachability = localeReachability(data);
  data.audit = audit(data);
  data.audit.baseline = loadBaseline();
  return data;
}

/**
 * 目标态断言 —— 路由面"应该长成什么样"，与今天的树无关。
 * 这些是 S1/S2/S3 的验收条件，也是防止以后有人把收敛改回软 404 的那道锁。
 *
 * 只断言**我这一轮真的会动的文件**：共享工作树里别人正在改的文件不能出现在这里，
 * 否则闸门会把别人的在途状态判成我的失败。
 */
export function targetStateFailures() {
  const failures = [];
  const has = (p) => existsSync(join(ROOT, p));
  const readIf = (p) => (has(p) ? read(join(ROOT, p)) : '');
  const need = (p, why, re, msg) => {
    const src = readIf(p);
    if (!src) {
      failures.push(`${p} 不存在：${why}`);
      return '';
    }
    if (!re.test(src)) failures.push(`${p} ${msg}：${why}`);
    return src;
  };

  // 限流可以写在路由文件里，也可以写在它 import 的服务里 —— 闸门要的是"这条链上有没有窗口"，
  // 不是某个字面量恰好出现在哪个文件。
  function hasRateLimitOnChain(entry, maxDepth = 2) {
    const seen = new Set();
    const stack = [[entry, 0]];
    while (stack.length) {
      const [relPath, depth] = stack.pop();
      if (seen.has(relPath) || depth > maxDepth) continue;
      seen.add(relPath);
      const src = readIf(relPath);
      if (!src) continue;
      if (/consumeRateLimit\(/.test(src)) return true;
      for (const m of src.matchAll(/from\s+'@\/(lib\/[^']+)'/g)) {
        for (const suffix of ['', '.js', '/index.js']) stack.push([`${m[1]}${suffix}`, depth + 1]);
      }
    }
    return false;
  }

  need(
    'app/not-found.js',
    '除 /admin 外整站在用 Next 默认 404（无品牌、无语言、无出口）',
    /x-locale|matchPathLocale/,
    '没有按路径语言出文案',
  );

  const fallback = readIf('app/[locale]/[...slug]/page.js');
  if (!fallback) {
    failures.push('app/[locale]/[...slug]/page.js 不存在：/zh/onboarding 这类前缀下的合法路径会继续 404');
  } else {
    if (!/permanentRedirect/.test(fallback)) failures.push('兜底页没做别名 308：/ja/studio 与 /ja-JP/studio 会继续同时可达');
    if (!/notFound\(\)/.test(fallback)) failures.push('兜底页没有 notFound() 分支：未知前缀路径会继续软跳转');
    // 判定顺序必须是"先拒未知 → 再规范化别名 → 最后降级"，反了就会给垃圾路径一个本地化味的 307。
    // 只看函数体：import 行的字母顺序会把这三个 search 全带偏。
    const body = fallback.split('\n').filter((line) => !/^import\s/.test(line)).join('\n');
    const reject = body.search(/isSupportedLocale/);
    const alias = body.search(/getLocaleConfig|permanentRedirect/);
    const downgrade = body.search(/UNPREFIXED_TOP_SEGMENTS/);
    if (!(reject >= 0 && alias > reject && downgrade > alias)) {
      failures.push('兜底页判定顺序不对：必须 未知语言 → 别名 308 → 无前缀降级，否则垃圾路径会拿到 307');
    }
    if (/cookies\(\)|headers\(\)/.test(fallback)) {
      failures.push('兜底页读了 cookie/header：那正是 /studio 对非英文用户永远打不开的那个病根，语言只能由路径决定');
    }
  }

  // 别名收敛的第二条腿：中间件先把前缀规范化，页面层才可能拿到唯一入口。
  // 放在 middleware.js 是因为三条 studio 入口在别的会话里脏着，页面层改不动。
  need(
    'middleware.js',
    '/ja/studio、/zh-CN/studio、/es-ES/studio 会继续各自产出一个重复 URL',
    /permanentRedirect|308/,
    '没做别名前缀 308 规范化',
  );

  // 悬空跳：/zh-CN → /zh-CN/studio 这条目标本身不存在，等于把重复 URL 又喂一遍。
  const localeRoot = need(
    'app/[locale]/page.js',
    '裸 ${locale} 拼出的 /zh-CN/studio 这类目标解析不到路由',
    /getLocaleConfig|normalizeLocale/,
    '还在用裸模板串拼跳转目标',
  );
  if (/\/\$\{locale\}\/studio/.test(localeRoot)) {
    failures.push('app/[locale]/page.js 仍把 params.locale 原样拼进跳转目标：必须过 getLocaleConfig 拿规范 rootPath');
  }

  for (const entry of [
    'app/studio/[[...slug]]/page.js',
    'app/zh/studio/[[...slug]]/page.js',
    'app/[locale]/studio/[[...slug]]/page.js',
  ]) {
    const src = readIf(entry);
    if (!src) {
      failures.push(`${entry} 不见了`);
      continue;
    }
    // isStudioSlug（lib/studio-routes.js）与直接查 STUDIO_TABS 等价，两种都算过关。
    if (!/isStudioSlug|STUDIO_TABS/.test(src)) {
      failures.push(`${entry} 没在路由层校验工作台段：/studio/任意乱码 会继续悄悄渲染图像工作台`);
    }
  }

  // 旧别名页把默认语言硬编码成 zh，非中文用户点进来会拿到中文壳。
  const assets = need(
    'app/assets/page.js',
    '旧别名跳转把默认语言写死成中文，非中文用户被语言劫持',
    /getLocaleConfig|matchPathLocale|normalizeLocale/,
    '还在用硬编码的默认语言',
  );
  if (/\/studio\/assets/.test(assets)) {
    failures.push('app/assets/page.js 还在跳 /studio/assets，该段不在工作台表里，S2.1 之后会 404');
  }

  for (const entry of ['app/workflow/[id]/page.js', 'app/workflow/[id]/[tab]/page.js']) {
    need(entry, '工作流页两种语言下都是英文壳，因为根本没传 locale', /locale/, '没把语言传进渲染的壳组件');
  }

  // 三处独立重载路径互不知情会 10s/15s 交替 ping-pong；共用预算是唯一收敛点。
  need(
    'lib/client/reloadBudget.js',
    'error.js / global-error.js / ChunkSelfHealing 各自自动重载，制造重载 ping-pong',
    /export/,
    '不存在',
  );
  const errorPage = readIf('app/error.js');
  if (errorPage && /useEffect[\s\S]{0,400}?\.reload\(\)/.test(errorPage)) {
    failures.push('app/error.js 在 useEffect 里自动 reload：错误页会自己刷，用户看不到发生了什么');
  }

  const banner = readIf('app/api/analytics/banner-event/route.js');
  if (banner && /userId:\s*body\./.test(banner)) {
    failures.push('banner-event 仍把 body.userId 写库：任何人都能给别人的账号刷曝光/点击');
  }
  need(
    'app/api/user/notifications/route.js',
    '改设置的 POST 没有同源校验，跨站表单可伪造',
    /guardMutation\(/,
    '缺 guardMutation',
  );
  for (const entry of ['app/api/auth/phone/send-code/route.js', 'app/api/auth/phone/verify/route.js']) {
    if (!hasRateLimitOnChain(entry)) {
      failures.push(`${entry} 这条链上没有 consumeRateLimit：短信按条计费，没有服务端窗口就等于给人刷账单`);
    }
  }

  for (const entry of ['components/LanguageSwitcher.js', 'components/UserDropdownMenu.js']) {
    need(entry, '两套切换器各自漂移，无前缀页上语言标签永远显示错', /localeSwitch/, '还没走 lib/client/localeSwitch.js');
  }
  return failures;
}

/**
 * 与"这一轮要做的事"无关的那一半：结构、声明漂移、棘轮、文档同步、反空断言。
 * S0 提交时它就该全绿，所以 P0 闸门只吃这一半。
 */
export function structuralFailures(data) {
  const failures = [...data.audit.hard];
  if (!existsSync(DOC)) failures.push('docs/route-map.md 不存在');
  else if (read(DOC) !== renderMarkdown(data)) failures.push('docs/route-map.md 与代码不同步：跑 npm run route:map');
  if (data.pages.length < MIN_PAGE_ROUTES) {
    failures.push(`只扫到 ${data.pages.length} 条页面路由，少于 ${MIN_PAGE_ROUTES}：目录遍历或 app/ 树被动过`);
  }
  if (data.handlers.length < MIN_API_ROUTES) {
    failures.push(`只扫到 ${data.handlers.length} 个 route.js，少于 ${MIN_API_ROUTES}：扫描逻辑失效`);
  }
  for (const [rule, hits] of Object.entries(data.audit.ratchet)) {
    const allowed = data.audit.baseline[rule];
    if (allowed === undefined) failures.push(`棘轮规则 ${rule} 没有基线项：跑 npm run lint:routes:update`);
    else if (hits.length > allowed) {
      failures.push(`棘轮规则 ${rule} 从 ${allowed} 涨到 ${hits.length}；全部命中：${hits.slice(0, 12).join(', ')}`);
    }
  }
  return failures;
}

export function checkData(data) {
  return {
    failures: [...structuralFailures(data), ...targetStateFailures()],
    markdown: renderMarkdown(data),
  };
}

function main() {
  const flags = new Set(process.argv.slice(2));
  const data = collect();
  const result = data.audit;

  if (flags.has('--report')) {
    for (const v of result.hard) console.log(`hard    ${v}`);
    for (const [rule, hits] of Object.entries(result.ratchet)) {
      console.log(`count   ${String(hits.length).padStart(4)}  基线 ${String(result.baseline[rule] ?? '—').padStart(4)}  ${rule}`);
    }
    return 0;
  }

  if (flags.has('--update')) {
    const counts = Object.fromEntries(Object.entries(result.ratchet).map(([k, v]) => [k, v.length]));
    writeFileSync(BASELINE, `${JSON.stringify({ counts }, null, 2)}\n`);
    result.baseline = counts;
    // 文档里印着这张表，所以重记基线必须连文档一起重写，否则 --check 立刻判"文档过期"。
    writeFileSync(DOC, renderMarkdown(data));
    console.log(`route baseline: ${JSON.stringify(counts)}`);
    console.log('wrote docs/route-map.md');
    return 0;
  }

  if (flags.has('--check')) {
    const { failures } = checkData(data);
    if (failures.length) {
      console.error(`route-map: ${failures.length} 项违规\n`);
      for (const f of failures.slice(0, 40)) console.error(`  ${f}`);
      if (failures.length > 40) console.error(`  … 还有 ${failures.length - 40} 项`);
      return 1;
    }
    console.log(
      `route-map: pass. ${data.pages.length} 页面路由 / ${data.handlers.length} 处理器 / ` +
        Object.entries(result.ratchet).map(([k, v]) => `${k}=${v.length}`).join(' '),
    );
    return 0;
  }

  writeFileSync(DOC, renderMarkdown(data));
  console.log(`wrote docs/route-map.md (${data.pages.length} page routes, ${data.handlers.length} handlers)`);
  for (const v of result.hard) console.log(`  ! ${v}`);
  return 0;
}

const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main());
