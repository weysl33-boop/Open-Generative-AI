/**
 * 模型概览统计的唯一实现。
 *
 * 服务端快照与客户端保存后的回算都走它：只在服务端算的话，任何一次行内修改之后
 * 统计卡都会停留在旧值，管理员看到的就不是真相。
 * 这里只放「能从模型列表推导」的指标；今日调用量、今日成本这类只存在于
 * 用量表里的数字仍由服务端快照提供。
 */
import { configuredMargin } from './pricing.js';

const ISSUE_STAT_KEYS = {
  'no-channel': 'routeMissing',
  'primary-unavailable': 'providerUnavailable',
  'primary-degraded': 'providerDegraded',
  'no-fallback': 'fallbackMissing',
  'cost-missing': 'costMissing',
  'credits-missing': 'creditsMissing',
};

const HEALTH_STAT_KEYS = {
  healthy: 'healthyModels',
  degraded: 'degradedModels',
  unhealthy: 'unhealthyModels',
  unknown: 'unknownModels',
  testing: 'testingModels',
};

export function deriveModelStats(models = []) {
  const byType = {};
  const providerChannels = new Set();
  const stats = {
    total: models.length,
    online: 0,
    offline: 0,
    channelsMounted: 0,
    multiChannelModels: 0,
    negativeMarginModels: 0,
    marginRateConfigured: null,
    marginRateMedian: null,
    marginSampleSize: 0,
    pricedModels: 0,
  };
  for (const key of Object.values(ISSUE_STAT_KEYS)) stats[key] = 0;
  for (const key of Object.values(HEALTH_STAT_KEYS)) stats[key] = 0;

  let anomalous = 0;
  for (const model of models) {
    byType[model.type] = (byType[model.type] || 0) + 1;
    stats.channelsMounted += model.routeCount || 0;
    if ((model.routeCount || 0) > 1) stats.multiChannelModels += 1;
    for (const provider of model.routes || []) providerChannels.add(provider.providerSlug || provider.providerId);

    if (!model.isActive) {
      stats.offline += 1;
      // 已下线模型不承载流量，健康分布只统计在线部分，否则「正常模型」卡会被下线项灌水。
      continue;
    }
    stats.online += 1;
    stats[HEALTH_STAT_KEYS[model.health] || 'unknownModels'] += 1;

    let flagged = false;
    for (const issue of model.issues || []) {
      const key = ISSUE_STAT_KEYS[issue.code];
      if (!key) continue;
      stats[key] += 1;
      // 缺成本 / 缺 Credits 属于定价待办，单独出现时不计入「异常路由」。
      if (key !== 'costMissing' && key !== 'creditsMissing') flagged = true;
    }
    if (flagged) anomalous += 1;
  }

  const margin = configuredMargin(models.filter((model) => model.isActive));
  return {
    ...stats,
    byType,
    providers: providerChannels.size,
    anomalousRoutes: anomalous,
    negativeMarginModels: models.filter(
      (model) => model.isActive && Number.isFinite(model.marginRate) && model.marginRate < 0
    ).length,
    marginRateConfigured: margin.marginRate,
    marginRateMedian: margin.marginRateMedian,
    marginSampleSize: margin.sampleSize,
    pricedModels: margin.pricedModels,
  };
}
