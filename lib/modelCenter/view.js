import {
  HEALTH_LABELS,
  ISSUE_LABELS,
  channelAvailability,
  channelHealthState,
  primaryChannelOf,
} from './routing.js';

export const TYPE_LABELS = {
  video: '视频生成',
  image: '图片生成',
  audio: '音频生成',
  lipsync: '口型同步',
  recast: '角色替换',
  'motion-control': '运镜控制',
};

export const CHANNEL_LABELS = {
  aggregator: '聚合网关',
  direct: '官方直连',
  unknown: '未确认',
};

export const STATUS_LABELS = {
  online: '正常上线',
  offline: '已下线',
};

export const ROUTE_STATE_LABELS = {
  ready: '渠道可用',
  blocked: '渠道全停用',
  degraded: '渠道降级',
  unmounted: '未挂载渠道',
};

/** 健康维度文案与配色口径由 routing.js 的 HEALTH_LABELS 提供，这里只补排序。 */
export const HEALTH_FILTER_ORDER = ['healthy', 'degraded', 'unhealthy', 'unknown'];

/** 筛选用口径：按秒 vs 按次，两者互斥且覆盖全量模型。 */
export const BILLING_MODE_LABELS = {
  second: '按秒计费',
  call: '按次计费',
};

/**
 * 健康状态的人话口径。unknown 必须显式写成「未探测」：provider_health_checks 没记录
 * 不代表上游正常，显示成「健康」就是给管理员一个假信号。
 */
export const HEALTH_TEXT_CN = {
  healthy: '健康',
  degraded: '降级',
  unhealthy: '故障',
  unknown: '未探测',
};

/** 探针口径：「上游实测在线」和「我们只是有密钥」对管理员是两个不同的结论。 */
export const PROBE_KIND_LABELS = {
  http: 'HTTP 实测',
  credential: '仅凭据校验',
};

const PROBE_FEEDBACK_TONES = {
  healthy: 'success',
  degraded: 'warning',
  unhealthy: 'danger',
};

/**
 * 把一次探测结论写成一句能直接放进反馈条的话。
 * 品牌级、模型级与渠道测试三处都要复述同一个结果，各写一份就会出现
 * 「这一页报成功、那一页报失败」；延迟没测到时也不能补成 0ms。
 */
export function probeFeedback(result) {
  const kind = PROBE_KIND_LABELS[result?.probeKind] ?? '口径未知的探针';
  const latency = Number.isFinite(result?.latencyMs) ? ` · ${formatLatency(result.latencyMs)}` : '';
  return {
    tone: PROBE_FEEDBACK_TONES[result?.healthStatus] ?? 'danger',
    text: `${kind} · ${result?.message || '探测无返回'}${latency}`,
  };
}

export const SORT_OPTIONS = [
  { value: 'default', label: '默认排序' },
  { value: 'calls', label: '调用量 (30 天)' },
  { value: 'cost-desc', label: '官方成本 高→低' },
  { value: 'cost-asc', label: '官方成本 低→高' },
  { value: 'credits-desc', label: 'Credits 高→低' },
  { value: 'credits-asc', label: 'Credits 低→高' },
  { value: 'margin-desc', label: '毛利率 高→低' },
  { value: 'margin-asc', label: '毛利率 低→高' },
  { value: 'updated', label: '最近更新' },
  { value: 'name', label: '模型名称' },
  { value: 'provider', label: '实际供应商' },
];

export function typeLabel(type) {
  return TYPE_LABELS[type] || type || '未分类';
}

export function statusOf(model) {
  return model.isActive ? 'online' : 'offline';
}

export function statusLabel(model) {
  return STATUS_LABELS[statusOf(model)];
}

function enabledRoutes(model) {
  return (model.routes || []).filter((r) => r.enabled && r.providerEnabled);
}

/** 服务端快照会直接给出派生结果；客户端乐观回算时按同一套规则就地重算。 */
export function healthOf(model) {
  if (typeof model.health === 'string') return model.health;
  const channel = primaryChannelOf(model);
  return channel ? channelHealthState(channel) : 'unknown';
}

export function healthLabel(model) {
  return HEALTH_LABELS[healthOf(model)] || HEALTH_LABELS.unknown;
}

/**
 * 单条渠道的直连/聚合归属：主渠道单元格按实际生效的那条判定，不套用全模型口径。
 * provider_type 没落库就是没有证据，显示「未确认」而不是默认当成官方直连。
 */
export function channelKindOf(channel) {
  if (!channel) return null;
  if (channel.providerType === 'aggregator') return 'aggregator';
  if (channel.providerType === 'official' || channel.providerType === 'direct') return 'direct';
  return 'unknown';
}

/**
 * 模型「实际挂在哪些供应商下」。运行时只读 provider_models，
 * 因此筛选项必须以路由为准；models_config.provider 只是无路由时的兜底显示。
 */
export function providersOf(model) {
  const ids = (model.routes || [])
    .map((r) => r.providerSlug || r.providerId)
    .filter(Boolean);
  return [...new Set(ids.length ? ids : [model.provider].filter(Boolean))];
}

/**
 * 「这个模型实际走哪家供应商」：以钉选/可用的主渠道为准。
 * 只有完全没挂载渠道时，models_config.provider 才是实际调用对象。
 */
export function providerLabelOf(model) {
  const primary = primaryChannelOf(model);
  if (primary) return primary.providerName || primary.providerSlug || primary.providerId || '—';
  return model.provider || '—';
}

/**
 * 可切换的备用渠道数（不含当前主渠道）。可用性一律走 channelAvailability，
 * 不读服务端装饰出来的 usable：那是同一个判定的第二份副本，客户端回算时容易漏带。
 */
export function fallbackCountOf(model) {
  if (Number.isFinite(model.fallbackCount)) return model.fallbackCount;
  const active = primaryChannelOf(model);
  return (model.routes || []).filter(
    (r) => channelAvailability(r).usable && (!active || r.id !== active.id)
  ).length;
}

/**
 * 全模型口径的直连/聚合：证据只有已挂载渠道的 provider_type。
 * 没有渠道就没有证据，按「未确认」参与筛选，不能再从 models_config.provider
 * 的字符串猜（曾经写成 provider === 'muapi' 即聚合，等于页面自己编数据）。
 */
export function channelOf(model) {
  const routes = enabledRoutes(model).length ? enabledRoutes(model) : model.routes || [];
  if (routes.some((r) => r.providerType === 'aggregator')) return 'aggregator';
  if (routes.some((r) => r.providerType === 'official' || r.providerType === 'direct')) return 'direct';
  return 'unknown';
}

export function routeStateOf(model) {
  const routes = model.routes || [];
  if (!routes.length) return 'unmounted';
  const usable = routes.filter((r) => channelAvailability(r).usable);
  if (!usable.length) return 'blocked';
  const state = healthOf(model);
  if (state === 'degraded' || state === 'unhealthy' || usable.length < routes.length) return 'degraded';
  return 'ready';
}

/** 计费方式来自供应商渠道的 cost_config.cost_per_second，不是页面推测。 */
export function billingOf(model) {
  return model.billingUnit === 'per_second' || model.billsPerSecond ? 'second' : 'call';
}

export function billingModeLabel(model) {
  return BILLING_MODE_LABELS[billingOf(model)];
}

export function routeNames(model) {
  return (model.routes || []).map((r) => r.providerName || r.providerId);
}

export function marginTone(model) {
  if (model.marginRate === null || model.marginRate === undefined) return 'muted';
  if (model.minMarginRate !== null && model.minMarginRate !== undefined) {
    return model.marginRate < model.minMarginRate ? 'danger' : 'success';
  }
  return 'neutral';
}

export function isMarginAlert(model) {
  return (
    model.marginRate !== null &&
    model.minMarginRate !== null &&
    model.marginRate < model.minMarginRate
  );
}

function haystack(model) {
  return [
    model.name,
    model.id,
    model.slug,
    model.provider,
    model.type,
    typeLabel(model.type),
    ...providersOf(model),
    ...routeNames(model),
    ...(model.routes || []).map((r) => r.providerModelId),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** URL 参数名 ↔ 内部筛选键；刷新 / 分享链接后筛选条件必须原样恢复。 */
export const PARAM_KEYS = {
  q: 'q',
  statuses: 'status',
  types: 'type',
  providers: 'provider',
  health: 'health',
  channels: 'channel',
  routeStates: 'route',
  issues: 'issue',
  billing: 'billing',
  sort: 'sort',
  view: 'view',
};

function toList(value) {
  const raw = Array.isArray(value) ? value.join(',') : String(value ?? '');
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseViewState(searchParams = {}) {
  return {
    filters: normalizeFilters({
      q: String(searchParams[PARAM_KEYS.q] || ''),
      statuses: toList(searchParams[PARAM_KEYS.statuses]),
      types: toList(searchParams[PARAM_KEYS.types]),
      providers: toList(searchParams[PARAM_KEYS.providers]),
      health: toList(searchParams[PARAM_KEYS.health]),
      channels: toList(searchParams[PARAM_KEYS.channels]),
      routeStates: toList(searchParams[PARAM_KEYS.routeStates]),
      issues: toList(searchParams[PARAM_KEYS.issues]),
      billing: toList(searchParams[PARAM_KEYS.billing]),
    }),
    sort: SORT_OPTIONS.some((option) => option.value === searchParams[PARAM_KEYS.sort])
      ? searchParams[PARAM_KEYS.sort]
      : 'default',
    // 主表是这一页的主要形态，默认 list；只有显式带 grid 参数才切卡片视图。
    view: searchParams[PARAM_KEYS.view] === 'grid' ? 'grid' : 'list',
  };
}

export function serializeViewState({ filters, sort, view }) {
  const params = new URLSearchParams();
  const f = normalizeFilters(filters);
  if (f.q) params.set(PARAM_KEYS.q, f.q);
  if (f.statuses.length) params.set(PARAM_KEYS.statuses, f.statuses.join(','));
  if (f.types.length) params.set(PARAM_KEYS.types, f.types.join(','));
  if (f.providers.length) params.set(PARAM_KEYS.providers, f.providers.join(','));
  if (f.health.length) params.set(PARAM_KEYS.health, f.health.join(','));
  if (f.channels.length) params.set(PARAM_KEYS.channels, f.channels.join(','));
  if (f.routeStates.length) params.set(PARAM_KEYS.routeStates, f.routeStates.join(','));
  if (f.issues.length) params.set(PARAM_KEYS.issues, f.issues.join(','));
  if (f.billing.length) params.set(PARAM_KEYS.billing, f.billing.join(','));
  if (sort && sort !== 'default') params.set(PARAM_KEYS.sort, sort);
  if (view === 'grid') params.set(PARAM_KEYS.view, 'grid');
  return params.toString();
}

export function normalizeFilters(raw = {}) {
  return {
    q: String(raw.q || '').trim().toLowerCase(),
    statuses: raw.statuses || [],
    types: raw.types || [],
    providers: raw.providers || [],
    health: raw.health || [],
    channels: raw.channels || [],
    routeStates: raw.routeStates || [],
    issues: raw.issues || [],
    billing: raw.billing || [],
  };
}

export function hasActiveFilters(filters) {
  const f = normalizeFilters(filters);
  return Boolean(
    f.q ||
      f.statuses.length ||
      f.types.length ||
      f.providers.length ||
      f.health.length ||
      f.channels.length ||
      f.routeStates.length ||
      f.issues.length ||
      f.billing.length
  );
}

export function filterModels(models, rawFilters) {
  const f = normalizeFilters(rawFilters);
  if (!hasActiveFilters(f)) return models;

  return models.filter((model) => {
    if (f.q && !haystack(model).includes(f.q)) return false;
    if (f.statuses.length && !f.statuses.includes(statusOf(model))) return false;
    if (f.types.length && !f.types.includes(model.type)) return false;
    if (f.providers.length && !providersOf(model).some((p) => f.providers.includes(p))) return false;
    if (f.health.length && !f.health.includes(healthOf(model))) return false;
    if (f.channels.length && !f.channels.includes(channelOf(model))) return false;
    if (f.routeStates.length && !f.routeStates.includes(routeStateOf(model))) return false;
    // 一个模型可能同时挂多条待办：命中任意一条就入选，与侧栏复选框口径一致。
    if (f.issues.length && !(model.issues || []).some((issue) => f.issues.includes(issue.code))) return false;
    if (f.billing.length && !f.billing.includes(billingOf(model))) return false;
    return true;
  });
}

const NULLS_LAST = (a, b) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : 0);

export function sortModels(models, sortKey) {
  const list = [...models];
  const byName = (a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans-CN');

  switch (sortKey) {
    case 'calls':
      return list.sort((a, b) => b.calls30d - a.calls30d || byName(a, b));
    case 'cost-desc':
      return list.sort(
        (a, b) => NULLS_LAST(a.officialCostUsd, b.officialCostUsd)
          || b.officialCostUsd - a.officialCostUsd
          || byName(a, b)
      );
    case 'cost-asc':
      return list.sort(
        (a, b) => NULLS_LAST(a.officialCostUsd, b.officialCostUsd)
          || a.officialCostUsd - b.officialCostUsd
          || byName(a, b)
      );
    case 'credits-desc':
      return list.sort((a, b) => b.credits - a.credits || byName(a, b));
    case 'credits-asc':
      return list.sort((a, b) => a.credits - b.credits || byName(a, b));
    case 'margin-desc':
      return list.sort(
        (a, b) => NULLS_LAST(a.marginRate, b.marginRate) || (b.marginRate ?? -Infinity) - (a.marginRate ?? -Infinity)
      );
    case 'margin-asc':
      return list.sort(
        (a, b) => NULLS_LAST(a.marginRate, b.marginRate) || (a.marginRate ?? Infinity) - (b.marginRate ?? Infinity)
      );
    case 'updated':
      return list.sort(
        (a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0) || byName(a, b)
      );
    case 'name':
      return list.sort(byName);
    case 'provider':
      return list.sort(
        (a, b) => providerLabelOf(a).localeCompare(providerLabelOf(b), 'zh-Hans-CN') || byName(a, b)
      );
    default:
      return list.sort((a, b) => a.sortOrder - b.sortOrder || byName(a, b));
  }
}

export function countBy(models, keyFn) {
  const counts = new Map();
  for (const model of models) {
    const key = keyFn(model);
    if (key === null || key === undefined) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

export function buildFacets(models, providerNames = {}) {
  const sortByCountThenLabel = (counts, labelFn) =>
    [...counts.entries()]
      .map(([value, count]) => ({ value, count, label: labelFn(value) }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'zh-Hans-CN'));

  // 一个模型可以挂在多家供应商下，所以按 providersOf 展开计数而不是只取 provider 字段；
  // 名称同样取自真实路由行，避免筛选项变成一份硬编码供应商清单。
  const providerCounts = new Map();
  const issueCounts = new Map();
  const names = { ...providerNames };
  for (const model of models) {
    for (const route of model.routes || []) {
      const key = route.providerSlug || route.providerId;
      if (key && route.providerName && !names[key]) names[key] = route.providerName;
    }
    for (const provider of providersOf(model)) {
      providerCounts.set(provider, (providerCounts.get(provider) || 0) + 1);
    }
    // 一个模型能同时挂多条待办，所以按 issues 展开而不是每个模型只记一个键。
    for (const issue of model.issues || []) {
      issueCounts.set(issue.code, (issueCounts.get(issue.code) || 0) + 1);
    }
  }

  const healthCounts = countBy(models, healthOf);

  return {
    statuses: sortByCountThenLabel(countBy(models, statusOf), (v) => STATUS_LABELS[v] || v),
    types: sortByCountThenLabel(countBy(models, (m) => m.type), typeLabel),
    providers: sortByCountThenLabel(providerCounts, (v) => names[v] || v),
    // 健康分布按固定顺序而不是数量排序：管理员对比两次刷新时，位置跳动比顺序更难看。
    health: HEALTH_FILTER_ORDER.filter((value) => healthCounts.has(value)).map((value) => ({
      value,
      count: healthCounts.get(value),
      label: HEALTH_TEXT_CN[value],
    })),
    channels: sortByCountThenLabel(countBy(models, channelOf), (v) => CHANNEL_LABELS[v] || v),
    routeStates: sortByCountThenLabel(countBy(models, routeStateOf), (v) => ROUTE_STATE_LABELS[v] || v),
    issues: sortByCountThenLabel(issueCounts, (v) => ISSUE_LABELS[v] || v),
    billing: sortByCountThenLabel(countBy(models, billingOf), (v) => BILLING_MODE_LABELS[v] || v),
  };
}

export function formatUsd(value, digits = 3) {
  const n = Number(value);
  if (!Number.isFinite(n) || value === null || value === undefined) return '—';
  return `$${n.toFixed(digits)}`;
}

export function formatCredits(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  return n.toLocaleString('en-US');
}

export function formatPercent(value, digits = 1) {
  const n = Number(value);
  if (!Number.isFinite(n) || value === null || value === undefined) return '—';
  return `${n.toFixed(digits)}%`;
}

export function formatMarkup(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || value === null || value === undefined) return '—';
  return `${n.toFixed(1)}×`;
}

/** 页面上所有美元售价/毛利都出自这一个数字，所以它必须连来源一起显示。 */
export function creditValuationText(valuation) {
  if (!valuation?.usdPerCredit) return '估值口径未知';
  const usd = formatUsd(valuation.usdPerCredit, 4);
  const cny = valuation.cnyPerCredit ? ` ≈¥${valuation.cnyPerCredit.toFixed(4)}` : '';
  return `1 Credit = ${usd}${cny}`;
}

export function creditValuationSourceText(valuation) {
  if (valuation?.source === 'setting') return '来自系统设置 credit_valuation';
  if (valuation?.source === 'invalid') return '系统设置里的 credit_valuation 不是合法数字，当前按内置值显示';
  if (valuation?.source === 'default') return '未配置系统设置，当前按内置默认值显示';
  return '估值来源未知';
}

export function formatCount(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '—';
  if (n >= 10000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

export function formatLatency(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || ms === null || ms === undefined) return '—';
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

export function formatRelativeTime(input) {
  if (!input) return '—';
  const then = new Date(input).getTime();
  if (!Number.isFinite(then)) return '—';
  const diff = Date.now() - then;
  if (diff < 0) return '—';
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return new Date(then).toLocaleDateString('zh-CN');
}
