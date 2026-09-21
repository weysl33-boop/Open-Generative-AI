import 'server-only';

import { getProviderAdapter } from '../adapters/index.js';
import { withTransaction } from '../db/index.js';
import { isPrimaryChannel } from '../modelCenter/routing.js';
import { getCanonicalModelById, listProviderModelsByModelId, listProviders, updateProviderHealth } from '../repositories/aiCatalog.js';
import { recordHealthCheck } from '../repositories/providers.js';
import {
  mapWithConcurrency,
  normalizeProbeOutcome,
  probeFailureOutcome,
  summarizeProbeResults,
} from './probeContract.js';

// 探针是真打上游的请求，一次请求的规模必须有上界，否则后台一次点击就能把
// 全部渠道打成限流，并且请求会一直占着 Node 事件循环。
const MAX_TARGETS_PER_REQUEST = 24;
const DEFAULT_CONCURRENCY = 4;

const PROBE_FAILURE_STATUS = Object.freeze({
  VALIDATION_ERROR: 422,
  NOT_FOUND: 404,
});

/** 探测失败码到 HTTP 状态的映射，供路由层复用，避免两处各写一份兜底。 */
export function probeFailureStatus(code) {
  return PROBE_FAILURE_STATUS[code] ?? 422;
}

/**
 * 一次探测要落两张表，缺任何一张页面上就有一处是假的：
 * - ai_studio.ai_providers.health_status 是路由与熔断读的"当前健康度"；
 * - ops_bill.provider_health_checks 是模型中心取最近一次探测延迟/口径的那份历史。
 * 只写前者的话，主表和切换弹层里的延迟列在探测之后依然是空的，
 * 管理员点了探测看不到任何变化。两张写在同一个事务里，不留半条记录。
 */
async function recordProbeOutcome(providerId, outcome) {
  await withTransaction(async (tx) => {
    await updateProviderHealth(providerId, outcome, tx);
    await recordHealthCheck({
      provider: providerId,
      status: outcome.healthStatus,
      latencyMs: outcome.latencyMs,
      errorCode: outcome.errorCode ?? null,
      details: {
        probeKind: outcome.probeKind,
        message: outcome.message,
        source: 'model_center_probe',
      },
      transaction: tx,
    });
  });
}

/**
 * 对单个供应商执行主动探测，并把结果落库。
 * success 表示"探测流程跑完并落库了"；渠道本身的健康度看 healthStatus。
 */
export async function probeProviderChannel(providerId) {
  const start = Date.now();
  let outcome;
  try {
    const adapter = await getProviderAdapter(providerId);
    outcome = normalizeProbeOutcome(await adapter.healthCheck(), {
      elapsedMs: Date.now() - start,
      fallbackMessage: '健康探针响应正常',
    });
  } catch (error) {
    outcome = probeFailureOutcome(error, { elapsedMs: Date.now() - start });
  }
  await recordProbeOutcome(providerId, outcome);
  return { success: true, providerId, ...outcome };
}

async function resolveProbeTargets({ providerIds, all }) {
  const providers = await listProviders();
  if (all) return { targets: providers.filter((p) => p.enabled), unknown: [] };

  const byKey = new Map();
  for (const provider of providers) {
    byKey.set(provider.id, provider);
    if (provider.slug) byKey.set(provider.slug, provider);
  }

  const targets = [];
  const unknown = [];
  for (const rawId of new Set(providerIds.map((id) => String(id).trim()).filter(Boolean))) {
    const provider = byKey.get(rawId);
    if (provider) targets.push(provider);
    else unknown.push(rawId);
  }
  return { targets, unknown };
}

/**
 * 品牌级批量 / 全量探测。
 * 调用方要么给 providerIds，要么给 all:true；两者都不给时不猜测范围。
 */
export async function probeProviderChannels({
  providerIds = null,
  all = false,
  concurrency = DEFAULT_CONCURRENCY,
} = {}) {
  const hasIds = Array.isArray(providerIds) && providerIds.length > 0;
  if (!all && !hasIds) {
    return { ok: false, code: 'VALIDATION_ERROR', message: '请指定 providerIds，或传 all:true 执行全量扫描' };
  }

  const { targets, unknown } = await resolveProbeTargets({ providerIds: hasIds ? providerIds : [], all });

  if (targets.length === 0) {
    return {
      ok: false,
      code: 'NOT_FOUND',
      message: unknown.length > 0 ? `未找到供应商：${unknown.join('、')}` : '当前没有启用中的供应商可供探测',
    };
  }
  if (targets.length > MAX_TARGETS_PER_REQUEST) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: `一次最多探测 ${MAX_TARGETS_PER_REQUEST} 个供应商（当前 ${targets.length} 个），请分批执行`,
    };
  }

  const results = await mapWithConcurrency(targets, concurrency, async (provider) => {
    const outcome = await probeProviderChannel(provider.id);
    return { ...outcome, providerName: provider.name };
  });

  // unknown 原样回传：点名要探测却不存在的供应商不能静默消失。
  return { ok: true, summary: summarizeProbeResults(results), unknown, results };
}

/**
 * 模型级探测：把该模型挂载的可服务渠道逐条打一次探针，复用同一套落库口径。
 */
export async function probeModelChannels(modelId) {
  const id = String(modelId ?? '').trim();
  if (!id) return { ok: false, code: 'VALIDATION_ERROR', message: '请指定要探测的模型 ID' };

  const model = await getCanonicalModelById(id);
  if (!model) return { ok: false, code: 'NOT_FOUND', message: `未找到模型 ${id}` };

  const channels = await listProviderModelsByModelId(model.id);
  if (channels.length === 0) {
    return { ok: false, code: 'NOT_FOUND', message: '该模型尚未挂载供应商渠道，无法探测' };
  }

  // 停用的渠道不打探针：为一个明知不承接流量的渠道把整个供应商标成故障，
  // 只会让熔断与健康数据一起说谎。
  const usable = channels.filter((channel) => channel.enabled);
  const skippedDisabled = channels.length - usable.length;
  if (usable.length === 0) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: `该模型的 ${channels.length} 条渠道均已停用，未执行探测`,
      skippedDisabled,
    };
  }
  if (usable.length > MAX_TARGETS_PER_REQUEST) {
    return {
      ok: false,
      code: 'VALIDATION_ERROR',
      message: `该模型有 ${usable.length} 条可服务渠道，超出单次 ${MAX_TARGETS_PER_REQUEST} 条上限，请逐渠道探测`,
      skippedDisabled,
    };
  }

  const results = await mapWithConcurrency(usable, DEFAULT_CONCURRENCY, async (channel) => {
    const outcome = await probeProviderChannel(channel.provider_id);
    return {
      ...outcome,
      channelId: channel.id,
      providerName: channel.provider_name,
      providerModelId: channel.provider_model_id,
      isPrimary: isPrimaryChannel(channel),
      priority: Number(channel.priority),
    };
  });

  return {
    ok: true,
    modelId: model.id,
    modelName: model.display_name || model.name,
    summary: summarizeProbeResults(results),
    skippedDisabled,
    results,
  };
}
