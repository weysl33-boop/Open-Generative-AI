import { logAudit } from '../admin/audit.js';
import { withTransaction } from '../db/index.js';
import { aggregateMargin, deriveModel } from '../modelCenter/pricing.js';
import {
  channelAvailability,
  channelHealthState,
  costUsdToNumber,
  primaryChannelOf,
  sortChannelsForDisplay,
} from '../modelCenter/routing.js';
import { deriveModelStats } from '../modelCenter/stats.js';
import * as modelsRepo from '../repositories/models.js';
import { resolveCreditValuation } from './creditValuation.js';

export async function getAllModelsOverview() {
  return await modelsRepo.listAllModels();
}

function toNumber(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * 渠道 → 后台可直接渲染的形态。costUsd 为 null 表示未配置，health 为 unknown
 * 表示从未真实探测过：这两点是「不要伪造数据」在数据层的落点。
 */
function decorateRoutes(routes) {
  return sortChannelsForDisplay(routes ?? []).map((route) => {
    const availability = channelAvailability(route);
    return {
      ...route,
      costUsd: costUsdToNumber({ baseCost: route.baseCost, currency: route.currency }),
      health: channelHealthState(route),
      usable: availability.usable,
      unavailableReason: availability.reason,
    };
  });
}

/**
 * 官方成本取当前实际会走的那条渠道的 base_cost；渠道没回填成本才退回
 * models_config.cost_usd（历史列），两者都没有就是 null —— 毛利随之变 null。
 * 换算链本身在 deriveModel 里，客户端保存后的回算走同一个函数。
 * 导出给路由服务复用：切换主渠道后回给前端的必须是同一形状的模型。
 *
 * creditUsdRate 必须显式传：它是系统设置里的估值口径，缺省就会让这条行和
 * 快照算出两个毛利率。
 */
export function decorateModel(row, creditUsdRate) {
  const routes = decorateRoutes(row.routes);
  const primary = primaryChannelOf({ routes });
  const calls30d = toNumber(row.calls_30d);
  const successCalls30d = toNumber(row.success_calls_30d);

  return deriveModel(
    {
      id: row.id,
      slug: row.id,
      name: row.name,
      type: row.type,
      provider: row.provider,
      isActive: Boolean(row.is_active),
      sortOrder: toNumber(row.sort_order),
      metadata: row.metadata_json ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,

      credits: toNumber(row.credits_price),
      legacyCostUsd: costUsdToNumber({ baseCost: row.cost_usd, currency: 'USD' }),
      minMarginRate: row.min_gross_margin_rate === null || row.min_gross_margin_rate === undefined
        ? null
        : Number((toNumber(row.min_gross_margin_rate) * 100).toFixed(1)),

      billingUnit: row.bills_per_second ? 'per_second' : null,
      routes,
      routeCount: toNumber(row.route_count),
      liveRouteCount: toNumber(row.live_route_count),
      primaryChannelId: primary?.id ?? null,
      primaryProviderId: primary?.providerSlug ?? primary?.providerId ?? null,
      primaryProviderName: primary?.providerName ?? null,
      fallbackCount: routes.filter((r) => r.usable && r.id !== primary?.id).length,
      probeLatencyMs: primary?.probeLatencyMs ?? null,
      probeCheckedAt: primary?.probeCheckedAt ?? null,
      lastHealthCheckAt: primary?.lastHealthCheckAt ?? null,

      calls30d,
      callsToday: toNumber(row.calls_today),
      successRate: calls30d > 0 ? Number(((successCalls30d / calls30d) * 100).toFixed(1)) : null,
      avgLatencyMs: row.avg_latency_ms === null ? null : toNumber(row.avg_latency_ms),
      creditsConsumed30d: toNumber(row.credits_30d),
      realCostUsd30d: toNumber(row.real_cost_30d),
      realCostUsdToday: toNumber(row.real_cost_today),
      lastCalledAt: row.last_called_at,
    },
    creditUsdRate
  );
}

export async function getModelCenterSnapshot() {
  const [rows, usage, valuation] = await Promise.all([
    modelsRepo.listModelsWithOperations(),
    modelsRepo.getModelCenterUsageTotals(),
    resolveCreditValuation(),
  ]);
  const creditUsdRate = valuation.usdPerCredit;

  const callsToday = toNumber(usage.calls_today);
  const costUsdToday = toNumber(usage.cost_usd_today);
  const creditsToday = toNumber(usage.credits_today);
  const revenueUsdToday = Number((creditsToday * creditUsdRate).toFixed(4));
  const models = rows.map((row) => decorateModel(row, creditUsdRate));

  return {
    creditUsdRate,
    creditValuation: valuation,
    models,
    stats: {
      ...deriveModelStats(models),
      callsToday,
      costUsdToday: Number(costUsdToday.toFixed(4)),
      creditsToday,
      revenueUsdToday,
      marginRateToday: revenueUsdToday > 0
        ? Number((((revenueUsdToday - costUsdToday) / revenueUsdToday) * 100).toFixed(1))
        : null,
      marginRate30d: aggregateMargin({
        models,
        creditUsdRate,
        creditsKey: 'creditsConsumed30d',
        costKey: 'realCostUsd30d',
      }),
    },
  };
}

export async function listActiveModels() {
  return modelsRepo.listActiveModels();
}

export async function findModelByEndpointOrId(key) {
  return modelsRepo.findModelByEndpointOrId(key);
}

export async function updateModel({ actor, id, updates, requestId }) {
  if (updates.name !== undefined && (typeof updates.name !== 'string' || updates.name.trim().length < 1 || updates.name.trim().length > 120)) {
    return { error: '模型名称必须为 1–120 个字符' };
  }
  for (const [field, label] of [['cost_usd', '成本价'], ['credits_price', '额度价格'], ['sort_order', '排序值']]) {
    if (updates[field] !== undefined && (!Number.isFinite(Number(updates[field])) || Number(updates[field]) < 0)) {
      return { error: `${label}必须是大于等于 0 的有效数字` };
    }
  }
  if (updates.credits_price !== undefined && !Number.isInteger(Number(updates.credits_price))) return { error: '额度价格必须是整数' };
  if (updates.sort_order !== undefined && !Number.isInteger(Number(updates.sort_order))) return { error: '排序值必须是整数' };
  if (updates.is_active !== undefined && typeof updates.is_active !== 'boolean') return { error: '模型启用状态格式无效' };
  return await withTransaction(async (tx) => {
    const previous = await modelsRepo.getModelById(id, tx);
    if (!previous) return { error: '未找到指定模型配置' };
    const updated = await modelsRepo.updateModelConfig(id, updates, tx);
    await logAudit({
      actor,
      action: 'models.update',
      targetType: 'model',
      targetId: id,
      riskLevel: 'medium',
      after: {
        previous: {
          cost_usd: previous.cost_usd,
          credits_price: previous.credits_price,
          is_active: previous.is_active,
        },
        updated: {
          cost_usd: updated.cost_usd,
          credits_price: updated.credits_price,
          is_active: updated.is_active,
        },
      },
      requestId,
      transaction: tx,
    });
    return { success: true, model: updated };
  });
}
