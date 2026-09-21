import { query, queryOne, queryMany, execute, nowIso, randomId } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function listCreations(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.user_number ILIKE ${nextParameter()} OR u.email ILIKE ${nextParameter()} OR c.user_id ILIKE ${nextParameter()} OR c.id ILIKE ${nextParameter()} OR c.label ILIKE ${nextParameter()} OR c.model ILIKE ${nextParameter()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const status = String(params.get('status') || '').trim();
  if (status) {
    clauses.push(`c.status = ${nextParameter()}`);
    sqlParams.push(status);
  }

  const studioId = String(params.get('studio_id') || '').trim();
  if (studioId) {
    clauses.push(`c.studio_id = ${nextParameter()}`);
    sqlParams.push(studioId);
  }

  const baseSql = `
    SELECT c.id, c.user_id, c.studio_id, c.label, c.result_url, c.status, c.credit_cost,
           c.actual_cost_usd, c.error_reason, c.reservation_id, c.idempotency_key,
           c.provider, c.model, c.provider_request_id, c.duration_ms, c.error_code, c.parent_creation_id, c.created_at,
           u.user_number, u.email, u.avatar_url
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'c',
  });
}

export async function listFailedCreations(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ["c.status NOT IN ('succeeded', 'completed', 'success')"];
  const sqlParams = [];
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.user_number ILIKE ${nextParameter()} OR u.email ILIKE ${nextParameter()} OR c.error_code ILIKE ${nextParameter()} OR c.error_reason ILIKE ${nextParameter()} OR c.model ILIKE ${nextParameter()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const baseSql = `
    SELECT c.id, c.user_id, c.studio_id, c.label, c.status, c.credit_cost,
           c.actual_cost_usd, c.error_reason, c.reservation_id, c.idempotency_key,
           c.provider, c.model, c.provider_request_id, c.duration_ms, c.error_code, c.created_at,
           u.user_number, u.email, u.avatar_url
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'c',
  });
}

export async function getFailureClusters() {
  const res = await query(`
    SELECT COALESCE(error_code, 'UNKNOWN_ERROR') AS code,
           COUNT(*) AS count,
           MAX(created_at) AS last_occurred_at
    FROM creations
    WHERE status NOT IN ('succeeded', 'completed', 'success')
    GROUP BY COALESCE(error_code, 'UNKNOWN_ERROR')
    ORDER BY count DESC
    LIMIT 10
  `);
  return res.rows;
}

export async function findCreationById(id, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    SELECT c.*, u.email
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE c.id = $1
  `, [id]);
}

export async function findUserCreationByIdempotency(userId, idempotencyKey, transaction = null) {
  if (!userId || !idempotencyKey) return null;
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    SELECT c.*, u.email
    FROM creations c
    JOIN users u ON u.id = c.user_id
    WHERE c.user_id = $1 AND c.idempotency_key = $2
  `, [userId, idempotencyKey]);
}

export async function listUserCreations(userId, limit = 50, studioId = '') {
  const params = [userId];
  let filterSql = '';
  if (studioId && studioId !== 'all') {
    params.push(studioId);
    filterSql = ` AND c.studio_id = $${params.length}`;
  }
  params.push(Math.min(100, Math.max(1, Number(limit) || 50)));
  const result = await query(`
    SELECT c.*, p.id AS community_post_id, p.likes_count AS community_likes,
      (p.id IS NOT NULL) AS is_shared
    FROM ai_studio.creations c
    LEFT JOIN ai_studio.community_posts p ON c.id = p.creation_id AND p.status = 'published'
    WHERE c.user_id = $1 ${filterSql}
    ORDER BY c.created_at DESC
    LIMIT $${params.length}
  `, params);
  return result.rows;
}

export async function listQueuedGenerationIds(batchSize = 10) {
  return queryMany(`
    SELECT id
    FROM creations
    WHERE status = 'queued'
    ORDER BY created_at ASC, id ASC
    LIMIT $1
  `, [Math.min(50, Math.max(1, Number(batchSize) || 10))]);
}

export async function listStaleGenerationIds(cutoff, limit = 50) {
  return queryMany(`
    SELECT id
    FROM creations
    WHERE status = 'processing' AND updated_at <= $1
    ORDER BY updated_at ASC
    LIMIT $2
  `, [cutoff, Math.min(100, Math.max(1, Number(limit) || 50))]);
}

/**
 * 已提交、等待上游结果的在途任务。没有这张表就无法做到「提交与轮询分开」，
 * 一条 3 分钟的视频只会在单次 HTTP 超时里被作废并重发。
 */
export async function listPollableGenerationIds(batchSize = 10) {
  return queryMany(`
    SELECT id
    FROM creations
    WHERE status = 'processing'
      AND provider_request_id IS NOT NULL
      AND (next_poll_at IS NULL OR next_poll_at <= NOW())
      AND (poll_locked_until IS NULL OR poll_locked_until <= NOW())
    ORDER BY next_poll_at NULLS FIRST, updated_at ASC
    LIMIT $1
  `, [Math.min(50, Math.max(1, Number(batchSize) || 10))]);
}

/** 原子领取一次轮询窗口：并发 worker 只有拿到锁的那个能推进失败/换渠道分支。 */
export async function claimGenerationPoll(creationId, { lockMs = 90_000 } = {}, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    UPDATE creations
    SET poll_locked_until = NOW() + ($2::double precision * INTERVAL '1 millisecond')
    WHERE id = $1
      AND status = 'processing'
      AND provider_request_id IS NOT NULL
      AND (next_poll_at IS NULL OR next_poll_at <= NOW())
      AND (poll_locked_until IS NULL OR poll_locked_until <= NOW())
    RETURNING *
  `, [creationId, Math.max(1000, Number(lockMs) || 90_000)]);
}

/**
 * 让出一条正在 processing 的任务，回到 queued 在同一标准模型内换渠道重试。
 * 必须清掉 provider_request_id：上游标识已经归档在那条失败的尝试记录里，
 * 留在任务行上会让轮询队列把这条已作废的句柄再捞起来继续查。
 * 保留 started_at，让排队让位窗口仍能据此限定总时长。
 */
export async function requeueGenerationTask(creationId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    UPDATE creations
    SET status = 'queued',
        provider_request_id = NULL,
        next_poll_at = NULL,
        poll_locked_until = NULL,
        updated_at = NOW()
    WHERE id = $1 AND status = 'processing'
    RETURNING *
  `, [creationId]);
}


export async function listUserSubscriptions(userId, limit = 20) {
  return queryMany(`
    SELECT id, provider, plan_id, status, current_period_end, created_at, updated_at
    FROM subscriptions WHERE user_id = $1
    ORDER BY updated_at DESC LIMIT $2
  `, [userId, limit]);
}

export async function listUserCreationSummaries(userId, limit = 20) {
  return queryMany(`
    SELECT id, studio_id, label, result_url, status, credit_cost, created_at
    FROM creations WHERE user_id = $1
    ORDER BY created_at DESC LIMIT $2
  `, [userId, limit]);
}

export async function getUserCreationById(userId, creationId) {
  return queryOne(
    `SELECT c.*, p.id AS community_post_id, (p.id IS NOT NULL) AS is_shared
     FROM ai_studio.creations c
     LEFT JOIN ai_studio.community_posts p ON c.id = p.creation_id AND p.status = 'published'
     WHERE c.id = $1 AND c.user_id = $2`,
    [creationId, userId]
  );
}

export async function deleteUserCreation(userId, creationId) {
  return (await execute('DELETE FROM creations WHERE id = $1 AND user_id = $2', [creationId, userId])) > 0;
}

export async function createGenerationTask({
  userId,
  studioId = 'studio',
  modelId,
  provider,
  label,
  creditCost,
  reservationId,
  idempotencyKey,
  inputSummary,
  transaction = null,
}) {
  const id = randomId('gen');
  const now = nowIso();
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    INSERT INTO creations (
      id, user_id, studio_id, label, status, credit_cost, reservation_id,
      idempotency_key, provider, model, input_summary_json, metadata_json,
      created_at, updated_at
    )
    VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9, $10::jsonb, $10::jsonb, $11, $11)
    ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING *
  `, [id, userId, studioId, label || `生成 ${modelId}`, creditCost, reservationId, idempotencyKey, provider, modelId, JSON.stringify(inputSummary || {}), now]);
}

export async function linkReservationToCreation(reservationId, creationId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return await run(`
    UPDATE credit_reservations
    SET creation_id = COALESCE(creation_id, $2)
    WHERE id = $1 AND (creation_id IS NULL OR creation_id = $2)
  `, [reservationId, creationId]);
}

/** 任务与实际结算的报价单一一对应：扣积分的数额只能从这条链接追溯。 */
export async function linkQuoteToCreation(quoteId, creationId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run('UPDATE creations SET quote_id = $2 WHERE id = $1 RETURNING *', [creationId, quoteId]);
}

export async function claimQueuedGeneration(creationId, transaction = null) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    UPDATE creations
    SET status = 'processing', started_at = COALESCE(started_at, NOW()), updated_at = NOW()
    WHERE id = $1 AND status = 'queued'
    RETURNING *
  `, [creationId]);
}

export async function updateGenerationOutcome(creationId, {
  status,
  resultUrl = undefined,
  providerRequestId = undefined,
  errorCode = undefined,
  errorReason = undefined,
  actualCostUsd = undefined,
  expectedStatus = undefined,
  nextPollAt = undefined,
  clearPollLock = undefined,
  pollLockMs = undefined,
  selectedProviderId = undefined,
  routingMode = undefined,
  totalAttempts = undefined,
  transaction = null,
}) {
  return await updateCreationStatus(creationId, {
    status,
    resultUrl,
    providerRequestId,
    errorCode,
    errorReason,
    actualCostUsd,
    expectedStatus,
    nextPollAt,
    clearPollLock,
    pollLockMs,
    selectedProviderId,
    routingMode,
    totalAttempts,
    transaction,
  });
}

export async function insertGenerationEvent({
  creationId,
  userId,
  eventType,
  fromStatus = null,
  toStatus = null,
  reservationId = null,
  provider = null,
  providerRequestId = null,
  idempotencyKey = null,
  metadata = {},
  transaction = null,
}) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return await run(`
    INSERT INTO generation_events (
      id, creation_id, user_id, event_type, from_status, to_status,
      reservation_id, provider, provider_request_id, idempotency_key, metadata_json
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
    ON CONFLICT (creation_id, event_type, idempotency_key)
      WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id, event_type, created_at
  `, [randomId('gev'), creationId, userId, eventType, fromStatus, toStatus, reservationId, provider, providerRequestId, idempotencyKey, JSON.stringify(metadata || {})]);
}

export async function getGenerationTrace(creationId) {
  const creation = await findCreationById(creationId);
  if (!creation) return null;
  const [events, auditLogs] = await Promise.all([queryMany(`
    SELECT id, event_type, from_status, to_status, reservation_id, provider,
           provider_request_id, idempotency_key, metadata_json, created_at
    FROM generation_events
    WHERE creation_id = $1
    ORDER BY created_at ASC, id ASC
  `, [creationId]), queryMany(`
    SELECT id, actor_id, actor_email, action, target_type, target_id, risk_level,
           before_json, after_json, request_id, created_at
    FROM admin_audit_logs
    WHERE target_type = 'creation' AND target_id = $1
    ORDER BY created_at ASC, id ASC
  `, [creationId])]);
  return {
    creation,
    events: events.map((event) => ({
      ...event,
      metadata: typeof event.metadata_json === 'string' ? JSON.parse(event.metadata_json) : event.metadata_json,
    })),
    auditLogs: auditLogs.map((audit) => ({
      ...audit,
      before: typeof audit.before_json === 'string' ? JSON.parse(audit.before_json) : (audit.before_json || null),
      after: typeof audit.after_json === 'string' ? JSON.parse(audit.after_json) : (audit.after_json || null),
    })),
  };
}

export async function createRetryCreation({ parentCreation, creditCost = 0 }) {
  const id = randomId('gen');
  const now = nowIso();
  await execute(`
    INSERT INTO creations (id, user_id, studio_id, label, status, credit_cost, provider, model, parent_creation_id, metadata_json, created_at, updated_at)
    VALUES ($1, $2, $3, $4, 'queued', $5, $6, $7, $8, $9::jsonb, $10, $10)
  `, [id, parentCreation.user_id, parentCreation.studio_id, parentCreation.label, creditCost, parentCreation.provider, parentCreation.model, parentCreation.id, JSON.stringify(parentCreation.metadata_json || {}), now]);
  return findCreationById(id);
}

export async function updateCreationStatus(id, { status, resultUrl, providerRequestId, errorCode, errorReason, durationMs, actualCostUsd, expectedStatus, nextPollAt, clearPollLock, pollLockMs, selectedProviderId, routingMode, totalAttempts, transaction = null }) {
  const updates = ['updated_at = NOW()'];
  const params = [];
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  if (status !== undefined) {
    updates.push(`status = ${nextParameter()}`);
    params.push(status);
    if (['succeeded', 'failed', 'cancelled'].includes(status)) updates.push('completed_at = COALESCE(completed_at, NOW())', 'next_poll_at = NULL', 'poll_locked_until = NULL');
  }
  if (nextPollAt !== undefined) {
    updates.push(`next_poll_at = ${nextParameter()}`);
    params.push(nextPollAt);
  }
  if (clearPollLock) updates.push('poll_locked_until = NULL');
  if (pollLockMs !== undefined) {
    // 与 claimGenerationPoll 用的是同一把锁：谁在轮询这条任务，别的 worker 就看不到它。
    updates.push(`poll_locked_until = NOW() + (${nextParameter()}::double precision * INTERVAL '1 millisecond')`);
    params.push(Math.max(1, Number(pollLockMs) || 1));
  }
  if (selectedProviderId !== undefined) {
    updates.push(`selected_provider_id = ${nextParameter()}`);
    params.push(selectedProviderId);
  }
  if (routingMode !== undefined) {
    updates.push(`routing_mode = ${nextParameter()}`);
    params.push(routingMode);
  }
  if (totalAttempts !== undefined) {
    updates.push(`total_attempts = ${nextParameter()}`);
    params.push(totalAttempts);
  }
  if (resultUrl !== undefined) {
    updates.push(`result_url = ${nextParameter()}`);
    params.push(resultUrl);
  }
  if (errorCode !== undefined) {
    updates.push(`error_code = ${nextParameter()}`);
    params.push(errorCode);
  }
  if (errorReason !== undefined) {
    updates.push(`error_reason = ${nextParameter()}`);
    params.push(errorReason);
  }
  if (durationMs !== undefined) {
    updates.push(`duration_ms = ${nextParameter()}`);
    params.push(durationMs);
  }
  if (actualCostUsd !== undefined) {
    updates.push(`actual_cost_usd = ${nextParameter()}`);
    params.push(actualCostUsd);
  }
  if (providerRequestId !== undefined) {
    updates.push(`provider_request_id = ${nextParameter()}`);
    params.push(providerRequestId);
    updates.push(`external_request_id = COALESCE(external_request_id, ${nextParameter()})`);
    params.push(providerRequestId);
  }

  const where = [`id = $${params.length + 1}`];
  params.push(id);
  if (expectedStatus !== undefined) {
    where.push(`status = $${params.length + 1}`);
    params.push(expectedStatus);
  }
  const runExecute = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await runExecute(`UPDATE creations SET ${updates.join(', ')} WHERE ${where.join(' AND ')}`, params);
  return await findCreationById(id, transaction);
}
