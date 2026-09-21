/**
 * 供应商路由的共享判定逻辑。
 *
 * 运行时选路（smartRouter）与后台展示（model-center）必须使用同一套成本换算与
 * 状态口径，否则后台显示「健康」而运行时把该渠道过滤掉，管理员看到的就不是真相。
 * 这里只放纯函数，服务端与客户端均可导入。
 */

export const HEALTH_STATES = Object.freeze(['healthy', 'degraded', 'unhealthy', 'unknown']);

export const HEALTH_LABELS = Object.freeze({
  healthy: 'Healthy',
  degraded: 'Degraded',
  unhealthy: 'Unhealthy',
  unknown: 'Unknown',
  testing: 'Testing',
});

/**
 * 与 smartRouter 历史实现保持一致的折算率。路由评分依赖它，改动等于改选路结果，
 * 所以只能有这一处定义。
 */
export const CNY_PER_USD = 7.2;

/** 渠道主选标记存放位置：provider_models.metadata JSONB，避免为展示需求改生产表结构。 */
export const PRIMARY_METADATA_KEY = 'primary';

/** JSONB 里布尔与字符串两种写法都出现过（历史脚本用 'true'），判定必须同时接受。 */
export function isPrimaryChannel(channel) {
  const flag = channel?.isPrimary ?? channel?.metadata?.[PRIMARY_METADATA_KEY];
  return flag === true || flag === 'true';
}

const CIRCUIT_OPEN_STATES = new Set(['open', 'circuit_open']);

/**
 * 渠道成本折算成 USD。成本缺失、为 0 或币种不认识时返回 null —— 调用方必须把
 * null 渲染成「未配置」，不能当 0 参与毛利计算。
 */
export function costUsdToNumber({ baseCost, currency } = {}) {
  const base = Number(baseCost);
  if (!Number.isFinite(base) || base <= 0) return null;
  const code = String(currency || 'USD').toUpperCase();
  if (code === 'CNY') return Number((base / CNY_PER_USD).toFixed(6));
  if (code === 'USD') return base;
  return null;
}

export function isChannelLive(channel) {
  return Boolean(channel?.enabled && channel?.providerEnabled);
}

/**
 * ai_studio.provider_models / ai_providers 的下划线行 → 判定用的渠道视图。
 * 运行时路由读下划线列、后台快照读驼峰字段，切换校验必须把两边对到同一形状，
 * 否则「后台判定可用」和「路由器真的会用」就会分叉。
 */
export function channelViewFromRow(row, provider = null, { adapterAvailable = false, credentialsConfigured = false } = {}) {
  const cost = row?.cost_config || {};
  return {
    id: row?.id,
    providerId: provider?.id ?? row?.provider_id,
    providerSlug: provider?.slug ?? row?.provider_id,
    providerName: provider?.name ?? row?.provider_name,
    providerType: provider?.provider_type ?? row?.provider_type,
    providerModelId: row?.provider_model_id,
    priority: Number(row?.priority || 0),
    enabled: Boolean(row?.enabled),
    providerEnabled: provider ? Boolean(provider.enabled) : true,
    metadata: row?.metadata || {},
    currency: cost.currency || 'USD',
    baseCost: Number(cost.base_cost || 0),
    healthStatus: provider?.health_status ?? row?.health_status,
    circuitState: provider?.circuit_state ?? row?.circuit_state,
    lastHealthCheckAt: provider?.last_health_check_at ?? null,
    adapterAvailable,
    credentialsConfigured,
    isPrimary: isPrimaryChannel(row),
  };
}

/**
 * 渠道排序：钉选的主渠道永远第一，其余按 priority DESC。
 * smartRouter 与后台共用，保证「后台显示的首选」就是「运行时真正会选的」。
 */
export function sortChannelsForDisplay(channels = []) {
  return [...channels].sort((a, b) => {
    const pin = Number(isPrimaryChannel(b)) - Number(isPrimaryChannel(a));
    if (pin) return pin;
    const live = Number(isChannelLive(b)) - Number(isChannelLive(a));
    if (live) return live;
    return Number(b.priority || 0) - Number(a.priority || 0)
      || String(a.providerId || a.provider_id).localeCompare(String(b.providerId || b.provider_id));
  });
}

/**
 * 渠道对路由器的可用性。reason 用人话说明为什么不可用，直接展示给管理员。
 */
export function channelAvailability(channel) {
  if (!channel) return { usable: false, reason: '渠道不存在' };
  if (!channel.providerEnabled) return { usable: false, reason: '供应商已停用' };
  if (!channel.enabled) return { usable: false, reason: '该渠道已停用' };
  if (CIRCUIT_OPEN_STATES.has(channel.circuitState)) {
    return { usable: false, reason: '熔断中，需人工或探测恢复' };
  }
  if (channel.healthStatus === 'unhealthy' || channel.healthStatus === 'disabled') {
    return { usable: false, reason: '供应商健康检查未通过' };
  }
  if (!channel.adapterAvailable) return { usable: false, reason: '没有可用的调用适配器' };
  if (!channel.credentialsConfigured) return { usable: false, reason: '未配置 API 凭据' };
  return { usable: true, reason: null };
}

/**
 * 渠道健康状态。health_status 的建表默认值是 'healthy'，从没探测过的渠道不能因此
 * 显示成健康 —— 没有 lastHealthCheckAt 就是 unknown。
 */
export function channelHealthState(channel) {
  if (!channel) return 'unknown';
  const availability = channelAvailability(channel);
  if (availability.usable) {
    if (!channel.lastHealthCheckAt) return 'unknown';
    if (channel.healthStatus === 'healthy') return 'healthy';
    if (channel.healthStatus === 'degraded') return 'degraded';
    return 'unhealthy';
  }
  // 「没配凭据」和「配了但挂了」对管理员是两个问题，前者不能染红成故障。
  if (!channel.providerEnabled || !channel.enabled || CIRCUIT_OPEN_STATES.has(channel.circuitState)) {
    return 'unhealthy';
  }
  if (channel.healthStatus === 'unhealthy' || channel.healthStatus === 'disabled') return 'unhealthy';
  return 'unknown';
}

/**
 * 模型当前实际走哪家：钉选渠道优先，其次取排序后的第一条可用渠道，
 * 全不可用时退回排序后的第一条（用于展示故障对象）。
 */
export function primaryChannelOf(model) {
  const channels = sortChannelsForDisplay(model?.routes || []);
  if (!channels.length) return null;
  const pinned = channels.find((c) => isPrimaryChannel(c) && channelAvailability(c).usable);
  if (pinned) return pinned;
  const usable = channels.find((c) => channelAvailability(c).usable);
  return usable || channels[0];
}

/**
 * 官方成本的唯一取值口径：当前实际会走的渠道成本 → models_config 历史成本 → null。
 * 服务端快照与客户端保存后的乐观回算都必须走这里，否则改完价再刷新，
 * 行上显示的成本会跳变成另一个数。
 */
export function officialCostOf({ routes = [], primaryChannelId = null, legacyCostUsd = null } = {}) {
  const primary = primaryChannelId
    ? routes.find((channel) => channel.id === primaryChannelId) || primaryChannelOf({ routes })
    : primaryChannelOf({ routes });
  const channelCost =
    primary?.costUsd ?? costUsdToNumber({ baseCost: primary?.baseCost, currency: primary?.currency });
  if (channelCost !== null && channelCost !== undefined) {
    return { costUsd: channelCost, source: 'provider_channel' };
  }
  const legacy = Number(legacyCostUsd) > 0 ? Number(legacyCostUsd) : null;
  return legacy === null
    ? { costUsd: null, source: null }
    : { costUsd: legacy, source: 'models_config' };
}

export function modelHealthState(model) {
  const channel = primaryChannelOf(model);
  if (!channel) return 'unknown';
  return channelHealthState(channel);
}

/**
 * 待办问题的短标签：统计卡与侧栏筛选项都读这一份，行内提示可以在它之上
 * 补更具体的原因（例如主渠道不可用的具体理由）。
 */
export const ISSUE_LABELS = Object.freeze({
  'no-channel': '未挂载渠道',
  'primary-unavailable': '主渠道不可用',
  'primary-degraded': '主渠道降级',
  'no-fallback': '无可用备用',
  'cost-missing': '未配置成本',
  'credits-missing': '未配置 Credits',
});

/**
 * 异常路由判定。返回的问题码同时驱动统计卡「异常路由」计数与行内提示。
 */
export function modelRouteIssues(model) {
  const issues = [];
  const channels = model?.routes || [];
  if (!channels.length) {
    issues.push({ code: 'no-channel', label: ISSUE_LABELS['no-channel'], severity: 'danger' });
    return issues;
  }

  const active = primaryChannelOf(model);
  const availability = channelAvailability(active);
  if (!availability.usable) {
    // 这里用具体原因而不是短标签：管理员要看到的是"熔断中"还是"没配凭据"。
    issues.push({ code: 'primary-unavailable', label: availability.reason, severity: 'danger' });
  } else if (channelHealthState(active) === 'degraded') {
    issues.push({ code: 'primary-degraded', label: '当前供应商响应降级', severity: 'warning' });
  }

  const healthyFallbacks = channels.filter(
    (c) => c !== active && channelAvailability(c).usable && channelHealthState(c) === 'healthy'
  );
  if (!healthyFallbacks.length) {
    issues.push({
      code: 'no-fallback',
      label: ISSUE_LABELS['no-fallback'],
      // 主线路本身健康时，缺备用只是韧性不足，不是故障。
      severity: availability.usable ? 'warning' : 'danger',
    });
  }

  if (!Number.isFinite(Number(costOf(model))) || Number(costOf(model)) <= 0) {
    issues.push({ code: 'cost-missing', label: ISSUE_LABELS['cost-missing'], severity: 'warning' });
  }
  if (!(Number(model?.credits) > 0)) {
    issues.push({ code: 'credits-missing', label: ISSUE_LABELS['credits-missing'], severity: 'warning' });
  }
  return issues;
}

/** 模型当前生效的官方成本；装饰后的模型两种字段名都可能存在，都读一次避免口径分叉。 */
function costOf(model) {
  const value = model?.officialCostUsd ?? model?.providerCostUsd;
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

export function hasRouteIssue(model) {
  const issues = modelRouteIssues(model);
  return issues.some((issue) => issue.severity === 'danger' || issue.code === 'credits-missing'
    || issue.code === 'cost-missing' || issue.code === 'primary-degraded');
}

/** 可一键切换的目标：可用且不是当前主渠道。 */
export function switchableAlternatives(model) {
  const active = primaryChannelOf(model);
  return (model?.routes || []).filter(
    (channel) => channel !== active && channelAvailability(channel).usable
  );
}

/** 推荐备用供应商：在可用备用里挑成本最低（成本未知的不参与比较）。 */
export function recommendFallback(model) {
  const alternatives = switchableAlternatives(model);
  if (!alternatives.length) return null;
  const withCost = alternatives.filter((c) => Number.isFinite(Number(c.costUsd)));
  if (!withCost.length) return alternatives[0];
  return withCost.reduce((best, c) => (c.costUsd < best.costUsd ? c : best));
}
