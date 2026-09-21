import 'server-only';

import { logAudit } from '../admin/audit.js';
import { publicErrorMessage } from '../security/publicError.js';
import { withTransaction } from '../db/index.js';
import { commitCredits, reserveCredits, voidCredits } from '../financial/creditService.js';
import { findModelByEndpointOrId } from '../repositories/models.js';
import {
  claimGenerationPoll,
  claimQueuedGeneration,
  createGenerationTask as insertGenerationTask,
  findCreationById,
  findUserCreationByIdempotency,
  insertGenerationEvent,
  linkQuoteToCreation,
  linkReservationToCreation,
  listStaleGenerationIds,
  requeueGenerationTask,
  updateGenerationOutcome,
} from '../repositories/creations.js';
import {
  countAttemptsByCreation,
  createGenerationAttempt,
  latestOpenAttempt,
  updateGenerationAttemptOutcome,
} from '../repositories/attempts.js';
import { insertProviderCostRecord } from '../repositories/costRecords.js';
import { recordProviderCall } from '../repositories/providers.js';
import { NON_RETRYABLE_ERROR_CODES } from '../adapters/BaseAdapter.js';
import { getGenerationProvider } from './generationProviders.js';
import { resolveCircuitConfig, recordProviderFailure, recordProviderSuccess } from './circuitBreaker.js';
import { createResilientProvider } from './providerRuntime.js';
import { routeGenerationTask, isFailoverEnabled } from './smartRouter.js';
import { consumePreparedQuote, recordSettledQuote, resolveGenerationQuote } from './generationQuote.js';
import { getServerProviderApiKey } from './providerSecrets.js';
import { assertGenerationTransition } from './generationState.js';
import { persistCreationResult } from '../storage/assetStorage.js';

const TASK_STATUSES = new Set(['queued', 'processing', 'succeeded', 'failed', 'cancelled']);

const MAX_JOB_ATTEMPTS = Math.max(1, Math.min(5, Number(process.env.GENERATION_MAX_ATTEMPTS) || 3));
const POLL_INTERVAL_MS = Math.max(1000, Number(process.env.PROVIDER_POLL_INTERVAL_MS) || 2000);
// 单次 worker 心跳内的轮询预算。用完就把任务留在 processing 交还队列，
// 下一次心跳凭 provider_request_id 继续轮询 —— 一条几分钟的视频不会被
// 单次 HTTP 超时作废，也不会因此向上游重复提交一次任务。
// 显式判空而不是 `||`：0 是合法取值（每次心跳只查一次上游状态）。
const POLL_BUDGET_MS = Number.isFinite(Number(process.env.GENERATION_POLL_BUDGET_MS))
  ? Math.max(0, Number(process.env.GENERATION_POLL_BUDGET_MS))
  : 45_000;
const POLL_LOCK_MS = Math.max(10_000, Number(process.env.GENERATION_POLL_LOCK_MS) || 90_000);
// 排队让位（并发满 / 维护）只允许在任务开始后的这段时间内反复发生，
// 否则一个永远排不上的任务会无限留在队列里烧调用次数。
const DEFER_WINDOW_MS = Math.max(60_000, Number(process.env.GENERATION_DEFER_WINDOW_MS) || 8 * 60_000);
const DEFERRAL_CODES = new Set(['CHANNEL_CAPACITY_FULL', 'MODEL_MAINTENANCE']);

// 换供应商也无法改变的失败：内容违规、入参非法，以及本地守卫类错误。
// 这些必须直接失败并释放额度，不能靠切换渠道掩盖问题（规格 §统一错误分类）。
const LOCAL_GUARD_CODES = new Set([
  'MODEL_NOT_FOUND', 'MODEL_DISABLED', 'MODEL_PRICE_INVALID', 'UNAUTHENTICATED',
  'IDEMPOTENCY_REQUIRED', 'NO_ACTIVE_PROVIDERS', 'ALL_PROVIDERS_UNAVAILABLE',
  'ADAPTER_NOT_CONFIGURED', 'GENERATION_FINALIZE_FAILED', 'INVALID_GENERATION_TRANSITION',
  'FAILOVER_DISABLED',
]);

function failoverEligible(error) {
  if (!error) return false;
  if (error.isRetryable === false) return false;
  const code = String(error.code || '');
  if (DEFERRAL_CODES.has(code)) return false;
  return !NON_RETRYABLE_ERROR_CODES.has(code) && !LOCAL_GUARD_CODES.has(code);
}

function safeInputSummary({ modelId, endpoint, prompt, parameters = {}, ...rest }) {
  return {
    modelId,
    endpoint,
    prompt: String(prompt || '').slice(0, 4000),
    parameters: parameters && typeof parameters === 'object' ? parameters : {},
    ...rest,
  };
}

function taskInput(creation) {
  const raw = creation?.input_summary_json;
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

// 尝试记录只存参数名：prompt 与任何凭据都不该被复制进每一条上游尝试。
function requestSummary({ providerModelId, parameters = {} }) {
  return {
    endpoint: providerModelId || null,
    parameterKeys: Object.keys(parameters || {}).sort(),
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function addGenerationEvent(creation, eventType, details = {}) {
  return insertGenerationEvent({
    creationId: creation.id,
    userId: creation.user_id,
    eventType,
    fromStatus: details.fromStatus ?? null,
    toStatus: details.toStatus ?? creation.status,
    reservationId: details.reservationId || creation.reservation_id,
    provider: details.provider || creation.provider,
    providerRequestId: details.providerRequestId || creation.provider_request_id || creation.external_request_id,
    idempotencyKey: details.idempotencyKey || `${creation.id}:${eventType}`,
    metadata: details.metadata || {},
    transaction: details.transaction || null,
  });
}

/**
 * 落定本任务的报价：客户端带回 quoteId 时先核销那张票（归属/有效期/数额任一不符即整单回滚），
 * 否则现落一张已消费的票据。两种情况都写 creations.quote_id，扣费数额只来自服务端重算。
 */
async function settleQuote({ quote, creationId, preparedQuoteId, userId, parameters, tx }) {
  if (!quote) return null;
  let settledId = null;
  if (preparedQuoteId && quote.catalogModelId) {
    settledId = await consumePreparedQuote({
      quoteId: preparedQuoteId,
      userId,
      modelId: quote.catalogModelId,
      credits: quote.credits,
      transaction: tx,
    });
  } else if (preparedQuoteId) {
    console.warn('[generation/quote-discarded]', { creationId, quoteId: preparedQuoteId, modelId: quote.modelId });
  }
  if (!settledId) settledId = await recordSettledQuote({ quote, creationId, userId, parameters, transaction: tx });
  return settledId;
}

export async function createGenerationTask({
  user,
  userId = user?.id,
  modelId,
  studioId = 'studio',
  prompt = '',
  parameters = {},
  idempotencyKey,
  label,
  preparedQuoteId = null,
}) {
  if (!userId) throw Object.assign(new Error('请先登录后再创建生成任务'), { code: 'UNAUTHENTICATED' });
  if (!idempotencyKey || String(idempotencyKey).trim().length < 8) {
    throw Object.assign(new Error('生成任务必须提供有效的幂等键'), { code: 'IDEMPOTENCY_REQUIRED' });
  }

  const normalizedKey = String(idempotencyKey).trim().slice(0, 200);
  const existing = await findUserCreationByIdempotency(userId, normalizedKey);
  if (existing) return { creation: existing, idempotent: true };

  const model = await findModelByEndpointOrId(modelId);
  if (!model) throw Object.assign(new Error('目标模型不存在'), { code: 'MODEL_NOT_FOUND' });
  if (!model.is_active) throw Object.assign(new Error('目标模型当前不可用'), { code: 'MODEL_DISABLED' });

  // 只有一条取价路径：显示给用户和实际预扣的数额都出自服务端报价，
  // 请求体里的任何积分字段都不参与计算。
  const quote = await resolveGenerationQuote({ model, parameters, userId });
  const creditCost = quote.credits;

  const inputSummary = safeInputSummary({ modelId: model.id, endpoint: model.id, prompt, parameters });
  return withTransaction(async (tx) => {
    const reservation = await reserveCredits({
      userId,
      amount: creditCost,
      modelId: model.id,
      studioId,
      idempotencyKey: normalizedKey,
      transaction: tx,
    });
    if (reservation.reservationId && reservation.idempotent && reservation.status !== 'RESERVED') {
      throw Object.assign(new Error('该幂等键对应的额度预扣已结束，不能重新创建生成任务'), { code: 'GENERATION_RESERVATION_TERMINAL' });
    }

    let creation = await insertGenerationTask({
      userId,
      studioId,
      modelId: model.id,
      provider: model.provider,
      label: label || `${model.name} 生成任务`,
      creditCost,
      reservationId: reservation.reservationId,
      idempotencyKey: normalizedKey,
      inputSummary,
      transaction: tx,
    });

    if (!creation) {
      creation = await findUserCreationByIdempotency(userId, normalizedKey, tx);
      if (!creation) throw new Error('生成任务写入后无法重新读取');
      if (reservation.reservationId && !reservation.idempotent) {
        throw Object.assign(new Error('生成任务幂等冲突，未创建新的额度预扣'), { code: 'GENERATION_IDEMPOTENCY_CONFLICT' });
      }
      return { creation, reservation, idempotent: true };
    }

    if (reservation.reservationId) await linkReservationToCreation(reservation.reservationId, creation.id, tx);
    const quoteId = await settleQuote({ quote, creationId: creation.id, preparedQuoteId, userId, parameters, tx });
    if (quoteId) creation = await linkQuoteToCreation(quoteId, creation.id, tx);
    await addGenerationEvent(creation, 'TASK_CREATED', {
      fromStatus: null,
      toStatus: 'queued',
      metadata: { modelId: model.id, creditCost, quoteId, idempotencyKey: normalizedKey },
      transaction: tx,
    });
    await logAudit({
      actor: { id: 'system:generation', email: 'system@koyosim.local' },
      action: 'generation.task_created',
      targetType: 'creation',
      targetId: creation.id,
      riskLevel: 'low',
      after: { userId, modelId: model.id, provider: model.provider, creditCost, quoteId, reservationId: reservation.reservationId, idempotencyKey: normalizedKey },
      transaction: tx,
    });
    return { creation, reservation, quoteId, idempotent: Boolean(reservation.idempotent) };
  });
}

function wrapClient({ rawClient, providerName, claimed }) {
  return createResilientProvider({
    provider: rawClient,
    providerName,
    onCall: (call) => recordProviderCall({
      provider: call.provider,
      action: call.action,
      requestId: claimed.provider_request_id || null,
      status: call.status,
      latencyMs: call.latencyMs,
      errorCode: call.errorCode,
      usage: { attempt: call.attempt || null, modelId: claimed.model, creationId: claimed.id },
    }).catch((error) => {
      console.error('[generation/provider-log]', { code: error.code || 'LOG_FAILED' });
    }),
  });
}

/**
 * 渠道 → 可调用客户端（带熔断/超时/重试外壳）。
 * 凭据只按所选网关单独取，不存在「这家没配密钥就借用别家密钥」的回落。
 */
async function openChannelClient({ claimed, channel, providerClient, providerFactory }) {
  const providerName = channel?.provider_id || providerClient?.providerId || claimed.provider;
  if (providerClient) {
    return { client: wrapClient({ rawClient: providerClient, providerName, claimed }), providerName };
  }
  const providerModelId = channel?.provider_model_id || null;
  const raw = await (providerFactory || getGenerationProvider)({
    provider: providerName,
    providerModelId,
    apiKey: await getServerProviderApiKey({ provider: providerName }),
  });
  return { client: wrapClient({ rawClient: raw, providerName, claimed }), providerName };
}

/**
 * 把渠道这次的成败写回持久熔断器。
 * 记账失败绝不能作废一次生成，所以整段吞掉；同时只有「换一家可能就好」的错误
 * 才计入熔断 —— 内容违规、入参非法是用户侧问题，不该把整条渠道判死。
 */
async function noteChannelOutcome({ modelId, providerId, succeeded, error = null }) {
  if (!providerId) return;
  try {
    if (succeeded) {
      await recordProviderSuccess(providerId);
      return;
    }
    if (!failoverEligible(error)) return;
    const config = await resolveCircuitConfig(modelId);
    const outcome = await recordProviderFailure(providerId, { failureThreshold: config.failureThreshold });
    if (outcome?.tripped) {
      console.warn('[generation/channel-circuit-open]', { provider: providerId, failures: outcome.consecutiveFailures });
    }
  } catch (err) {
    console.error('[generation/channel-breaker]', { code: err.code || 'BREAKER_RECORD_FAILED' });
  }
}

function upstreamFailureFromPoll({ providerId, snapshot }) {
  const status = snapshot?.status;
  return Object.assign(
    new Error(snapshot?.error || `供应商 ${providerId} 生成失败`),
    {
      code: status === 'cancelled' ? 'PROVIDER_TASK_CANCELLED' : 'UPSTREAM_GENERATION_FAILED',
      provider: providerId,
    },
  );
}

async function recordAttemptCost({ claimed, attempt, channel, estimatedCostUsd, actualCostUsd, creditsCharged }) {
  return insertProviderCostRecord({
    jobId: claimed.id,
    attemptId: attempt?.id || null,
    providerId: channel.provider_id,
    modelId: claimed.model,
    creditsCharged,
    // base_cost 的单位口径尚未逐渠道标定（见 docs/定价提案-积分刻度统一.md §2.2），
    // 所以估算值仅供路由打分参考；真实成本以 actual_cost_usd（上游回传）为准。
    estimatedCostUsd: Number(estimatedCostUsd || 0),
    actualCostUsd: Number(actualCostUsd || 0),
    currency: 'USD',
  }).catch((error) => {
    console.error('[generation/cost-record]', { code: error.code || 'COST_RECORD_FAILED' });
    return null;
  });
}

async function finalizeSuccess({ claimed, channel, attempt, result, startedAt }) {
  const persistedResultUrl = await persistCreationResult({
    url: result.resultUrl,
    creationId: claimed.id,
    mediaType: claimed.media_type || 'image',
  }).catch(() => result.resultUrl);

  await updateGenerationAttemptOutcome(attempt.id, {
    status: 'succeeded',
    providerRequestId: result.providerRequestId || null,
    durationMs: Date.now() - startedAt,
    actualCostUsd: Number(result.actualCostUsd || 0),
    metadata: result.metadata || {},
  }).catch(() => null);
  await recordAttemptCost({
    claimed,
    attempt,
    channel,
    estimatedCostUsd: channel.costUsd,
    actualCostUsd: result.actualCostUsd,
    creditsCharged: claimed.credit_cost,
  });
  await noteChannelOutcome({ modelId: claimed.model, providerId: channel.provider_id, succeeded: true });

  const succeeded = await withTransaction(async (tx) => {
    if (claimed.reservation_id) {
      await commitCredits({
        reservationId: claimed.reservation_id,
        creationId: claimed.id,
        settledAmount: claimed.credit_cost,
        expectedUserId: claimed.user_id,
        transaction: tx,
      });
    }
    const updated = await updateGenerationOutcome(claimed.id, {
      status: 'succeeded',
      resultUrl: persistedResultUrl || result.resultUrl,
      providerRequestId: result.providerRequestId || null,
      actualCostUsd: Number.isFinite(Number(result.actualCostUsd)) ? Number(result.actualCostUsd) : 0,
      durationMs: Date.now() - startedAt,
      expectedStatus: 'processing',
      transaction: tx,
    });
    if (!updated) {
      const current = await findCreationById(claimed.id, tx);
      if (current?.status === 'succeeded') return current;
      throw Object.assign(new Error('生成任务状态更新失败，结算事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
    }
    await addGenerationEvent(updated, 'TASK_SUCCEEDED', {
      fromStatus: 'processing',
      toStatus: 'succeeded',
      provider: channel.provider_id,
      providerRequestId: result.providerRequestId,
      metadata: { attempt: attempt.attempt_number, provider: channel.provider_id, ...(result.metadata || {}) },
      transaction: tx,
    });
    await logAudit({
      actor: { id: 'system:generation', email: 'system@koyosim.local' },
      action: 'generation.task_succeeded',
      targetType: 'creation',
      targetId: claimed.id,
      riskLevel: 'low',
      after: { userId: updated.user_id, modelId: updated.model, provider: channel.provider_id, attempts: attempt.attempt_number, creditCost: updated.credit_cost, reservationId: updated.reservation_id, providerRequestId: updated.provider_request_id },
      transaction: tx,
    });
    return updated;
  });
  return { creation: succeeded, success: true };
}

async function finalizeFailure({ claimed, error, startedAt, providerId = null }) {
  const safeFailureReason = publicErrorMessage(error, '模型供应商调用失败');
  const failed = await withTransaction(async (tx) => {
    if (claimed.reservation_id) {
      await voidCredits({
        reservationId: claimed.reservation_id,
        reason: safeFailureReason,
        expectedUserId: claimed.user_id,
        transaction: tx,
      });
    }
    const updated = await updateGenerationOutcome(claimed.id, {
      status: 'failed',
      errorCode: error?.code || 'PROVIDER_ERROR',
      errorReason: safeFailureReason,
      durationMs: Date.now() - startedAt,
      expectedStatus: 'processing',
      transaction: tx,
    });
    if (!updated) {
      const current = await findCreationById(claimed.id, tx);
      if (['failed', 'cancelled'].includes(current?.status)) return current;
      throw Object.assign(new Error('生成任务失败状态写入失败，释放事务已回滚'), { code: 'GENERATION_FINALIZE_FAILED' });
    }
    await addGenerationEvent(updated, 'TASK_FAILED', {
      fromStatus: 'processing',
      toStatus: 'failed',
      provider: providerId || updated.provider,
      metadata: { code: error?.code || 'PROVIDER_ERROR', reason: safeFailureReason },
      transaction: tx,
    });
    await logAudit({
      actor: { id: 'system:generation', email: 'system@koyosim.local' },
      action: 'generation.task_failed',
      targetType: 'creation',
      targetId: claimed.id,
      riskLevel: 'medium',
      after: { userId: updated.user_id, modelId: updated.model, provider: providerId || updated.provider, creditCost: updated.credit_cost, reservationId: updated.reservation_id, errorCode: updated.error_code, errorReason: updated.error_reason },
      transaction: tx,
    });
    return updated;
  });
  return { creation: failed, success: false, error: safeFailureReason };
}

async function deferTask({ claimed, error }) {
  const startedAt = claimed.started_at ? new Date(claimed.started_at).getTime() : 0;
  const requeued = startedAt && Date.now() - startedAt < DEFER_WINDOW_MS
    ? await requeueGenerationTask(claimed.id)
    : null;
  if (requeued) {
    await addGenerationEvent(claimed, 'TASK_DEFERRED', {
      fromStatus: 'processing',
      toStatus: 'queued',
      metadata: { code: error.code, reason: error.message?.slice(0, 500) },
      idempotencyKey: `${claimed.id}:defer:${Date.now()}`,
    }).catch(() => null);
    return { creation: requeued, deferred: true };
  }
  return finalizeFailure({ claimed, error, startedAt: startedAt || Date.now() });
}

async function pollWindow({ claimed, client, attempt, channel, providerRequestId, startedAt, budgetMs = 0 }) {
  const tickStartedAt = Date.now();
  for (;;) {
    const snapshot = await client.poll({ providerRequestId });
    if (snapshot?.status === 'succeeded') {
      return finalizeSuccess({
        claimed,
        channel,
        attempt,
        startedAt,
        result: {
          providerRequestId,
          resultUrl: snapshot.resultUrl,
          actualCostUsd: snapshot.actualCostUsd,
          metadata: snapshot.metadata || {},
        },
      });
    }
    if (snapshot?.status === 'failed' || snapshot?.status === 'cancelled') {
      throw upstreamFailureFromPoll({ providerId: channel.provider_id, snapshot });
    }
    if (Date.now() - tickStartedAt >= budgetMs) {
      // 返回更新后的行而不是进入本轮时的快照：调用方要据此读到 provider_request_id。
      const deferred = await updateGenerationOutcome(claimed.id, {
        providerRequestId,
        nextPollAt: new Date(Date.now() + POLL_INTERVAL_MS).toISOString(),
        clearPollLock: true,
      });
      await addGenerationEvent(claimed, 'PROVIDER_POLL_DEFERRED', {
        metadata: { provider: channel.provider_id, providerRequestId },
        idempotencyKey: `${claimed.id}:poll:${Math.floor(Date.now() / POLL_INTERVAL_MS)}`,
      }).catch(() => null);
      return { creation: deferred || claimed, pending: true, providerRequestId };
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

/**
 * 单个生成任务的推进主循环：路由 → 建尝试 → 提交 → 轮询；
 * 失败时只在同一标准模型的其余渠道间故障转移（规格 Rule 九：禁止跨模型降级）。
 */
async function driveTask({ claimed, providerClient = null, providerFactory = null }) {
  const creationId = claimed.id;
  const input = taskInput(claimed);
  const startedAt = claimed.started_at ? new Date(claimed.started_at).getTime() : Date.now();
  // 尝试预算按任务累计而不是按心跳重置：一条任务一生最多 MAX_JOB_ATTEMPTS 次上游调用。
  let attempts = await countAttemptsByCreation(creationId);
  const triedProviders = [];
  let lastError = null;
  // 路由器带回的策略开关：关掉时首轮失败就地终止，保留供应商的真实错误作为失败原因。
  let failoverEnabled = true;

  // 先占住轮询锁：本函数持有下列上游句柄期间，不允许并发 worker 的轮询循环
  // 去结算同一条 reservation。
  await updateGenerationOutcome(creationId, { pollLockMs: POLL_LOCK_MS });

  while (attempts < MAX_JOB_ATTEMPTS) {
    attempts += 1;
    let channel = null;
    let attempt = null;
    try {
      if (providerClient) {
        // 注入客户端（测试 / 同步型供应商）：不查目录，直接用给定渠道调用。
        channel = { provider_id: providerClient.providerId || claimed.provider, provider_model_id: claimed.model };
      } else {
        const route = await routeGenerationTask({
          jobId: creationId,
          modelId: claimed.model,
          parameters: input.parameters || {},
          excludedProviderIds: triedProviders,
        });
        channel = { ...route.selected, costUsd: route.winner?.costUsd ?? null, routingMode: route.routingMode };
        failoverEnabled = route.failoverEnabled !== false;
      }
      triedProviders.push(channel.provider_id);
      await updateGenerationOutcome(creationId, {
        selectedProviderId: channel.provider_id,
        routingMode: channel.routingMode ?? null,
        totalAttempts: attempts,
      });
      attempt = await createGenerationAttempt({
        creationId,
        attemptNumber: attempts,
        providerId: channel.provider_id,
        providerModelId: channel.provider_model_id || claimed.model,
        requestPayload: requestSummary({ providerModelId: channel.provider_model_id, parameters: input.parameters }),
      });
      const opened = await openChannelClient({ claimed, channel, providerClient, providerFactory });
      const submitted = await opened.client.submit({ creation: claimed });
      await updateGenerationAttemptOutcome(attempt.id, {
        status: submitted.resultUrl ? 'succeeded' : 'processing',
        providerRequestId: submitted.providerRequestId || null,
        actualCostUsd: Number(submitted.actualCostUsd || 0),
        durationMs: Date.now() - startedAt,
        metadata: submitted.metadata || {},
      });
      await addGenerationEvent(claimed, 'PROVIDER_SUBMITTED', {
        metadata: { attempt: attempts, provider: channel.provider_id, providerRequestId: submitted.providerRequestId },
        idempotencyKey: `${creationId}:submit:${attempts}`,
      }).catch(() => null);
      if (submitted.resultUrl) {
        return finalizeSuccess({ claimed, channel, attempt, startedAt, result: submitted });
      }
      // 提交成功即落库上游句柄：进程下一刻崩掉，恢复的 worker 也只查状态、不再提交。
      await updateGenerationOutcome(creationId, {
        providerRequestId: submitted.providerRequestId,
        nextPollAt: new Date(Date.now() + POLL_INTERVAL_MS).toISOString(),
        pollLockMs: POLL_LOCK_MS,
      });
      return await pollWindow({
        claimed,
        client: opened.client,
        attempt,
        channel,
        providerRequestId: submitted.providerRequestId,
        startedAt,
        budgetMs: POLL_BUDGET_MS,
      });
    } catch (error) {
      lastError = error;
      if (DEFERRAL_CODES.has(String(error?.code)) && !attempt) {
        // 并发满 / 维护中：排队让位，不消耗失败预算，也不写尝试记录。
        return deferTask({ claimed, error });
      }
      if (attempt) {
        await updateGenerationAttemptOutcome(attempt.id, {
          status: String(error?.code) === 'PROVIDER_TIMEOUT' ? 'timeout' : 'failed',
          errorCode: error?.code || 'PROVIDER_ERROR',
          errorReason: publicErrorMessage(error, '模型供应商调用失败'),
          durationMs: Date.now() - startedAt,
        }).catch(() => null);
        await recordAttemptCost({
          claimed,
          attempt,
          channel: channel || { provider_id: attempt.provider_id },
          estimatedCostUsd: channel?.costUsd,
          actualCostUsd: 0,
          creditsCharged: 0,
        });
        await noteChannelOutcome({
          modelId: claimed.model,
          providerId: channel?.provider_id || attempt.provider_id,
          succeeded: false,
          error,
        });
      }
      if (!failoverEligible(error)) break;
      if (!failoverEnabled) break;
    }
  }
  return finalizeFailure({ claimed, error: lastError, startedAt, providerId: triedProviders[triedProviders.length - 1] });
}

export async function processGenerationTask({
  creationId,
  providerClient = null,
  providerFactory = null,
}) {
  const before = await findCreationById(creationId);
  if (!before) return { error: 'TASK_NOT_FOUND' };
  if (!TASK_STATUSES.has(before.status)) throw new Error(`不支持的生成任务状态: ${before.status}`);
  if (before.status === 'succeeded' || before.status === 'failed' || before.status === 'cancelled') {
    return { creation: before, idempotent: true };
  }
  assertGenerationTransition(before.status, 'processing');

  const claimed = await withTransaction(async (tx) => {
    const next = await claimQueuedGeneration(creationId, tx);
    if (!next) return null;
    await addGenerationEvent(next, 'TASK_PROCESSING', {
      fromStatus: 'queued',
      toStatus: 'processing',
      metadata: { startedAt: new Date().toISOString() },
      transaction: tx,
    });
    await logAudit({
      actor: { id: 'system:generation', email: 'system@koyosim.local' },
      action: 'generation.task_processing',
      targetType: 'creation',
      targetId: creationId,
      riskLevel: 'low',
      after: { userId: next.user_id, modelId: next.model, provider: next.provider, reservationId: next.reservation_id },
      transaction: tx,
    });
    return next;
  });
  if (!claimed) {
    const current = await findCreationById(creationId);
    return { creation: current, inProgress: current?.status === 'processing', idempotent: true };
  }

  return driveTask({ claimed, providerClient, providerFactory });
}

/**
 * 恢复一条已提交、仍在等待上游结果的任务。
 * 关键约束：这里绝不重新提交，只按 provider_request_id 继续查状态。
 */
export async function resumeGenerationTask({ creationId, providerFactory = null }) {
  const claimed = await claimGenerationPoll(creationId, { lockMs: POLL_LOCK_MS });
  if (!claimed) return { skipped: true };
  const attempt = await latestOpenAttempt(creationId);
  if (!attempt) {
    // 没有未结束的尝试记录（老数据）：交回队列由主循环按新尝试处理。
    await requeueGenerationTask(creationId);
    return { requeued: true };
  }
  if (!claimed.provider_request_id) {
    await updateGenerationAttemptOutcome(attempt.id, { status: 'failed', errorCode: 'PROVIDER_REQUEST_ID_MISSING', errorReason: '任务缺少上游标识', durationMs: 0 }).catch(() => null);
    await requeueGenerationTask(creationId);
    return { requeued: true };
  }

  const channel = { provider_id: attempt.provider_id, provider_model_id: attempt.provider_model_id };
  try {
    const opened = await openChannelClient({ claimed, channel, providerFactory });
    return await pollWindow({
      claimed,
      client: opened.client,
      attempt,
      channel,
      providerRequestId: claimed.provider_request_id,
      startedAt: claimed.started_at ? new Date(claimed.started_at).getTime() : Date.now(),
    });
  } catch (error) {
    await updateGenerationAttemptOutcome(attempt.id, {
      status: String(error?.code) === 'PROVIDER_TIMEOUT' ? 'timeout' : 'failed',
      errorCode: error?.code || 'PROVIDER_ERROR',
      errorReason: publicErrorMessage(error, '模型供应商调用失败'),
      durationMs: Date.now() - (claimed.started_at ? new Date(claimed.started_at).getTime() : Date.now()),
    }).catch(() => null);
    await recordAttemptCost({ claimed, attempt, channel, estimatedCostUsd: 0, actualCostUsd: 0, creditsCharged: 0 });
    await noteChannelOutcome({ modelId: claimed.model, providerId: channel.provider_id, succeeded: false, error });
    const remaining = MAX_JOB_ATTEMPTS - await countAttemptsByCreation(creationId);
    // 轮询失败同样是「要不要换渠道」的决策：关闭故障转移的模型不能靠重新入队偷偷换家。
    const maySwitchProvider = remaining > 0 && failoverEligible(error)
      && await isFailoverEnabled(claimed.model).catch(() => true);
    if (maySwitchProvider) {
      // 还有尝试预算且是可切换的失败：回到 queued 由主循环在同一模型内换渠道重试。
      await requeueGenerationTask(creationId);
      return { creation: await findCreationById(creationId), failoverQueued: true };
    }
    return finalizeFailure({ claimed, error, startedAt: claimed.started_at ? new Date(claimed.started_at).getTime() : Date.now(), providerId: channel.provider_id });
  }
}

export async function handleGenerationCallback({
  creationId,
  status,
  resultUrl = null,
  providerRequestId = null,
  errorCode = 'PROVIDER_ERROR',
  errorReason = '模型供应商返回失败',
  actualCostUsd = 0,
  durationMs = null,
  callbackIdempotencyKey,
}) {
  if (!callbackIdempotencyKey || String(callbackIdempotencyKey).trim().length < 8) {
    throw Object.assign(new Error('供应商回调必须提供有效的幂等键'), { code: 'IDEMPOTENCY_REQUIRED' });
  }
  if (!['succeeded', 'failed', 'cancelled'].includes(status)) {
    throw new Error('供应商回调状态无效', { code: 'INVALID_CALLBACK_STATUS' });
  }

  const before = await findCreationById(creationId);
  if (!before) return { error: 'TASK_NOT_FOUND' };
  if (['succeeded', 'failed', 'cancelled'].includes(before.status)) return { creation: before, idempotent: true };
  if (before.status !== 'processing') {
    throw Object.assign(new Error(`任务当前状态不接受供应商回调: ${before.status}`), { code: 'INVALID_CALLBACK_STATE' });
  }

  try {
    if (status === 'succeeded' && !resultUrl) throw Object.assign(new Error('成功回调缺少结果地址'), { code: 'CALLBACK_RESULT_REQUIRED' });
    const attempt = await latestOpenAttempt(creationId);
    return await withTransaction(async (tx) => {
      if (status === 'succeeded') {
        if (before.reservation_id) {
          await commitCredits({ reservationId: before.reservation_id, creationId, settledAmount: before.credit_cost, expectedUserId: before.user_id, transaction: tx });
        }
      } else if (before.reservation_id) {
        await voidCredits({ reservationId: before.reservation_id, reason: errorReason, expectedUserId: before.user_id, transaction: tx });
      }

      const updated = await updateGenerationOutcome(creationId, {
        status,
        resultUrl: status === 'succeeded' ? resultUrl : null,
        providerRequestId,
        errorCode: status === 'succeeded' ? null : errorCode,
        errorReason: status === 'succeeded' ? null : errorReason,
        actualCostUsd,
        durationMs,
        expectedStatus: 'processing',
        transaction: tx,
      });
      if (!updated || updated.status !== status) {
        const current = await findCreationById(creationId, tx);
        return { creation: current, idempotent: ['succeeded', 'failed', 'cancelled'].includes(current?.status) };
      }
      await addGenerationEvent(updated, `CALLBACK_${status.toUpperCase()}`, {
        fromStatus: 'processing',
        toStatus: status,
        providerRequestId,
        idempotencyKey: `callback:${callbackIdempotencyKey}`,
        metadata: { callbackIdempotencyKey },
        transaction: tx,
      });
      await logAudit({
        actor: { id: 'system:generation-callback', email: 'system@koyosim.local' },
        action: `generation.callback_${status}`,
        targetType: 'creation',
        targetId: creationId,
        riskLevel: status === 'succeeded' ? 'low' : 'medium',
        after: { userId: updated.user_id, modelId: updated.model, provider: updated.provider, creditCost: updated.credit_cost, reservationId: updated.reservation_id, providerRequestId: updated.provider_request_id, callbackIdempotencyKey },
        transaction: tx,
      });
      if (attempt) {
        await updateGenerationAttemptOutcome(attempt.id, {
          status: status === 'succeeded' ? 'succeeded' : 'failed',
          providerRequestId,
          durationMs,
          errorCode: status === 'succeeded' ? null : errorCode,
          errorReason: status === 'succeeded' ? null : errorReason,
          actualCostUsd: Number(actualCostUsd || 0),
          metadata: { via: 'webhook', callbackIdempotencyKey },
          transaction: tx,
        }).catch(() => null);
      }
      await insertProviderCostRecord({
        jobId: creationId,
        attemptId: attempt?.id || null,
        providerId: attempt?.provider_id || updated.provider,
        modelId: updated.model,
        creditsCharged: status === 'succeeded' ? Number(updated.credit_cost || 0) : 0,
        estimatedCostUsd: 0,
        actualCostUsd: Number(actualCostUsd || 0),
      }).catch((error) => console.error('[generation/callback-cost]', { code: error.code || 'COST_RECORD_FAILED' }));
      return { creation: updated, success: status === 'succeeded', idempotent: false };
    });
  } catch (error) {
    const current = await findCreationById(creationId);
    if (['succeeded', 'failed', 'cancelled'].includes(current?.status)) return { creation: current, idempotent: true };
    throw error;
  }
}

export async function expireStaleGenerationTasks({ timeoutMs = 15 * 60 * 1000, limit = 50 } = {}) {
  const effectiveTimeoutMs = Math.max(60_000, Number(timeoutMs) || 15 * 60 * 1000);
  const cutoff = new Date(Date.now() - effectiveTimeoutMs).toISOString();
  const stale = await listStaleGenerationIds(cutoff, limit);
  const results = [];

  for (const row of stale) {
    try {
      const current = await findCreationById(row.id);
      if (!current || current.status !== 'processing') {
        results.push({ id: row.id, status: 'already_terminal' });
        continue;
      }
      const attempt = await latestOpenAttempt(row.id);
      const failed = await withTransaction(async (tx) => {
        if (current.reservation_id) {
          await voidCredits({ reservationId: current.reservation_id, reason: '供应商超时，系统自动释放额度', expectedUserId: current.user_id, transaction: tx });
        }
        const updated = await updateGenerationOutcome(row.id, {
          status: 'failed',
          errorCode: 'PROVIDER_TIMEOUT',
          errorReason: '模型供应商处理超时，额度已释放，请重试',
          durationMs: current.started_at ? Date.now() - new Date(current.started_at).getTime() : null,
          expectedStatus: 'processing',
          transaction: tx,
        });
        if (!updated) return findCreationById(row.id, tx);
        if (attempt) {
          await updateGenerationAttemptOutcome(attempt.id, {
            status: 'timeout',
            errorCode: 'PROVIDER_TIMEOUT',
            errorReason: '等待供应商结果超时',
            durationMs: current.started_at ? Date.now() - new Date(current.started_at).getTime() : null,
            transaction: tx,
          });
        }
        await addGenerationEvent(updated, 'TASK_TIMEOUT', {
          fromStatus: 'processing',
          toStatus: 'failed',
          metadata: { cutoff, timeoutMs: effectiveTimeoutMs },
          idempotencyKey: `timeout:${row.id}`,
          transaction: tx,
        });
        await logAudit({
          actor: { id: 'system:generation-watchdog', email: 'system@koyosim.local' },
          action: 'generation.task_timeout',
          targetType: 'creation',
          targetId: row.id,
          riskLevel: 'medium',
          after: { userId: updated.user_id, modelId: updated.model, provider: updated.provider, reservationId: updated.reservation_id, errorCode: updated.error_code },
          transaction: tx,
        });
        return updated;
      });
      if (failed?.status === 'failed') {
        results.push({ id: row.id, status: 'failed' });
      } else {
        results.push({ id: row.id, status: 'race_lost' });
      }
    } catch (error) {
      const current = await findCreationById(row.id);
      if (['succeeded', 'failed', 'cancelled'].includes(current?.status)) {
        results.push({ id: row.id, status: 'already_terminal' });
      } else {
        results.push({ id: row.id, status: 'error', error: error.code || 'GENERATION_TIMEOUT_FAILED' });
      }
    }
  }

  return { checkedCount: stale.length, processed: results };
}
