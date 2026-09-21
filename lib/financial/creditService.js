import 'server-only';

import { query, queryOne, execute, withTransaction, nowIso, randomId } from '../db/index.js';
import { CREDIT_BUCKET_TYPES, DAILY_CHECKIN_REWARD, RESERVATION_STATUS, RESERVATION_TTL_MINUTES } from './constants.js';

/**
 * 校验并清洗多桶过期状态
 */
function normalizeWalletBuckets(wallet, now = new Date()) {
  let daily = Number(wallet.daily_free_credits || 0);
  let sub = Number(wallet.subscription_credits || 0);
  const perpetual = Number(wallet.perpetual_credits || 0);
  const frozen = Number(wallet.frozen_credits || 0);

  // 每日积分过期判定
  if (wallet.daily_expires_at && new Date(wallet.daily_expires_at).getTime() <= now.getTime()) {
    daily = 0;
  }
  // 订阅积分过期判定
  if (wallet.subscription_expires_at && new Date(wallet.subscription_expires_at).getTime() <= now.getTime()) {
    sub = 0;
  }

  return {
    daily,
    subscription: sub,
    perpetual,
    frozen,
    totalAvailable: daily + sub + perpetual,
  };
}

/**
 * 获取用户算力积分多桶钱包
 */
export async function getCreditWallet(userId) {
  if (!userId) return null;
  let wallet = await queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [userId]);
  const now = nowIso();

  if (!wallet) {
    // 兼容老用户初始额度
    const oldUser = await queryOne('SELECT credits FROM users WHERE id = $1', [userId]);
    const initPerpetual = Number(oldUser?.credits || 0);
    await execute(`
      INSERT INTO credit_wallets
      (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
      VALUES ($1, 0, 0, $2, 0, 1, $3, $4)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId, initPerpetual, now, now]);
    wallet = await queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [userId]);
  }

  const normalized = normalizeWalletBuckets(wallet, new Date(now));

  // 检查今日是否已签到
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const checkinRow = await queryOne(`
    SELECT id FROM credit_ledger_v2
    WHERE user_id = $1 AND action_type = 'DAILY_CHECKIN' AND created_at >= $2
    LIMIT 1
  `, [userId, todayStart.toISOString()]);

  return {
    userId: wallet.user_id,
    dailyFree: normalized.daily,
    dailyExpiresAt: wallet.daily_expires_at,
    subscriptionCredits: normalized.subscription,
    subscriptionExpiresAt: wallet.subscription_expires_at,
    perpetualCredits: normalized.perpetual,
    frozenCredits: normalized.frozen,
    totalAvailable: normalized.totalAvailable,
    isCheckedInToday: Boolean(checkinRow),
    updatedAt: wallet.updated_at,
  };
}

/**
 * 每日签到领免费积分 (24h过期机制，行业常见)
 */
export async function dailyCheckIn(userId) {
  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  // 今天 23:59:59.999 过期
  const expiresAt = new Date();
  expiresAt.setHours(23, 59, 59, 999);

  return await withTransaction(async (tx) => {
    // 先锁钱包再判重：两个并发请求若都在加锁前读到"未签到"，
    // 会各自累加一次奖励，签到就变成了双倍发放。
    let wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!wallet) {
      await tx.execute(`
        INSERT INTO credit_wallets
        (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
        VALUES ($1, 0, 0, 0, 0, 1, $2, $3)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, now.toISOString(), now.toISOString()]);
      wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    }

    // 锁已持有，此处的读能看到并发事务提交后的流水。
    const existing = await tx.queryOne(`
      SELECT id FROM credit_ledger_v2
      WHERE user_id = $1 AND action_type = 'DAILY_CHECKIN' AND created_at >= $2
      LIMIT 1
    `, [userId, todayStart.toISOString()]);

    if (existing) {
      throw new Error('今日已完成签到，请明天再来');
    }

    const currentDaily = (wallet.daily_expires_at && new Date(wallet.daily_expires_at).getTime() > now.getTime())
      ? Number(wallet.daily_free_credits || 0)
      : 0;

    const newDaily = currentDaily + DAILY_CHECKIN_REWARD;

    // 3. 更新多桶钱包
    await tx.execute(`
      UPDATE credit_wallets
      SET daily_free_credits = $1, daily_expires_at = $2, version = version + 1, updated_at = $3
      WHERE user_id = $4
    `, [newDaily, expiresAt.toISOString(), now.toISOString(), userId]);

    // 4. 记账流水（幂等键让"一天一次"由数据库唯一索引兜底）
    const ledgerId = `cl2_${randomId()}`;
    await tx.execute(`
      INSERT INTO credit_ledger_v2
      (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, created_at)
      VALUES ($1, $2, 'DAILY_FREE', $3, $4, 'DAILY_CHECKIN', null, $5, $6, $7)
    `, [
      ledgerId, userId, DAILY_CHECKIN_REWARD, newDaily,
      `每日签到赠送 ${DAILY_CHECKIN_REWARD} 算力点 (今日有效)`,
      `daily_checkin:${userId}:${todayStart.toISOString().slice(0, 10)}`,
      now.toISOString(),
    ]);

    return {
      success: true,
      rewardCredits: DAILY_CHECKIN_REWARD,
      dailyTotal: newDaily,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

/**
 * 跨桶智能扣减拆分计算 (FIFO 优先级：每日免费 -> 周期订阅 -> 永久点数)
 */
function computeSplitDeduction(normalizedWallet, amount) {
  let remainingNeeded = amount;
  const split = { daily: 0, subscription: 0, perpetual: 0 };

  // 1. 先扣每日免费池
  if (normalizedWallet.daily > 0) {
    const deduct = Math.min(normalizedWallet.daily, remainingNeeded);
    split.daily = deduct;
    remainingNeeded -= deduct;
  }

  // 2. 再扣周期订阅池
  if (remainingNeeded > 0 && normalizedWallet.subscription > 0) {
    const deduct = Math.min(normalizedWallet.subscription, remainingNeeded);
    split.subscription = deduct;
    remainingNeeded -= deduct;
  }

  // 3. 最后扣永久购买池
  if (remainingNeeded > 0 && normalizedWallet.perpetual > 0) {
    const deduct = Math.min(normalizedWallet.perpetual, remainingNeeded);
    split.perpetual = deduct;
    remainingNeeded -= deduct;
  }

  return {
    isSufficient: remainingNeeded === 0,
    split,
  };
}

/**
 * Phase 1: 两阶段预冻结 (Reserve)
 * 在发起 AI 任务前锁定对应算力点数，防止并发零元购与透支
 */
export async function reserveCredits({ userId, amount, modelId, studioId = 'studio', idempotencyKey, transaction = null }) {
  const reqAmount = parseInt(amount, 10);
  if (isNaN(reqAmount) || reqAmount <= 0) {
    throw new Error('预扣额度必须大于 0');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000);

  const reserve = async (tx) => {
    // 幂等防重
    if (idempotencyKey) {
      const existing = await tx.queryOne(
        'SELECT * FROM credit_reservations WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existing) {
        if (existing.user_id !== userId || existing.model_id !== modelId || Number(existing.reserved_amount) !== reqAmount || existing.studio_id !== studioId) {
          throw Object.assign(new Error('幂等键已经用于另一笔生成请求'), { code: 'IDEMPOTENCY_CONFLICT' });
        }
        return {
          reservationId: existing.id,
          status: existing.status,
          reservedAmount: existing.reserved_amount,
          idempotent: true,
        };
      }
    }

    // 锁定钱包
    let wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!wallet) {
      const nowStr = now.toISOString();
      await tx.execute(`
        INSERT INTO credit_wallets
        (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
        VALUES ($1, 0, 0, 0, 0, 1, $2, $3)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, nowStr, nowStr]);
      wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    }

    const normalized = normalizeWalletBuckets(wallet, now);
    const { isSufficient, split } = computeSplitDeduction(normalized, reqAmount);

    if (!isSufficient) {
      throw Object.assign(new Error(`算力点数不足！本次生成需要 ${reqAmount} 积分，当前可用 ${normalized.totalAvailable} 积分`), { code: 'INSUFFICIENT_CREDITS' });
    }

    // 计算各桶扣减后新数值，以及增加冻结金额
    const newDaily = normalized.daily - split.daily;
    const newSub = normalized.subscription - split.subscription;
    const newPerpetual = normalized.perpetual - split.perpetual;
    const newFrozen = normalized.frozen + reqAmount;

    // 原子更新钱包
    await tx.execute(`
      UPDATE credit_wallets
      SET daily_free_credits = $1,
          subscription_credits = $2,
          perpetual_credits = $3,
          frozen_credits = $4,
          version = version + 1,
          updated_at = $5
      WHERE user_id = $6
    `, [newDaily, newSub, newPerpetual, newFrozen, now.toISOString(), userId]);
    await tx.execute('UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3', [newDaily + newSub + newPerpetual, now.toISOString(), userId]);

    // 写入预扣单
    const reservationId = `res_${randomId()}`;
    await tx.execute(`
      INSERT INTO credit_reservations
      (id, user_id, studio_id, model_id, reserved_amount, settled_amount, bucket_split_json, status, idempotency_key, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, 0, $6, 'RESERVED', $7, $8, $9)
    `, [reservationId, userId, studioId, modelId, reqAmount, JSON.stringify(split), idempotencyKey || reservationId, expiresAt.toISOString(), now.toISOString()]);

    const ledgerRows = [
      ['DAILY_FREE', split.daily, newDaily],
      ['SUBSCRIPTION', split.subscription, newSub],
      ['PERPETUAL', split.perpetual, newPerpetual],
    ];
    for (const [bucketType, bucketAmount, balanceAfter] of ledgerRows) {
      if (bucketAmount <= 0) continue;
      await tx.execute(`
        INSERT INTO credit_ledger_v2
          (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, created_at)
        VALUES ($1, $2, $3, $4, $5, 'TASK_RESERVE', $6, $7, $8, $9)
      `, [`cl2_${randomId()}`, userId, bucketType, -bucketAmount, balanceAfter, reservationId,
        `生成任务预扣 ${modelId}`, idempotencyKey ? `${idempotencyKey}:${bucketType}:reserve` : null, now.toISOString()]);
    }

    return {
      reservationId,
      status: RESERVATION_STATUS.RESERVED,
      reservedAmount: reqAmount,
      split,
      expiresAt: expiresAt.toISOString(),
    };
  };

  return transaction ? reserve(transaction) : withTransaction(reserve);
}

/**
 * Phase 2A: 两阶段确认结算 (Commit)
 * AI 任务生成成功后，将冻结资金正式核销扣除
 */
export async function commitCredits({ reservationId, creationId = null, settledAmount = null, expectedUserId = null, transaction = null }) {
  const now = nowIso();

  const commit = async (tx) => {
    const reservation = await tx.queryOne(
      'SELECT * FROM credit_reservations WHERE id = $1 FOR UPDATE',
      [reservationId]
    );

    if (!reservation) {
      throw new Error('未找到该预冻结凭单');
    }
    if (expectedUserId && reservation.user_id !== expectedUserId) {
      throw Object.assign(new Error('无权操作该预冻结凭单'), { code: 'FORBIDDEN' });
    }

    if (reservation.status === RESERVATION_STATUS.COMMITTED) {
      return { success: true, alreadyCommitted: true, reservationId };
    }

    if (reservation.status !== RESERVATION_STATUS.RESERVED) {
      throw new Error(`预扣凭单状态为 ${reservation.status}，无法执行结算`);
    }

    const reservedAmount = Number(reservation.reserved_amount);
    const actualCost = settledAmount !== null ? Number(settledAmount) : reservedAmount;
    if (!Number.isFinite(actualCost) || actualCost !== reservedAmount) {
      throw Object.assign(new Error('当前生成任务不支持部分结算'), { code: 'SETTLEMENT_MISMATCH' });
    }
    const split = typeof reservation.bucket_split_json === 'string'
      ? JSON.parse(reservation.bucket_split_json || '{}')
      : (reservation.bucket_split_json || {});

    // 锁定钱包，扣减 frozen_credits
    const wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [reservation.user_id]);
    const currentFrozen = Number(wallet?.frozen_credits || 0);
    const newFrozen = Math.max(0, currentFrozen - reservedAmount);

    await tx.execute(`
      UPDATE credit_wallets
      SET frozen_credits = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [newFrozen, now, reservation.user_id]);
    await tx.execute(`
      UPDATE users
      SET credits = COALESCE((SELECT daily_free_credits + subscription_credits + perpetual_credits FROM credit_wallets WHERE user_id = $1), 0), updated_at = $2
      WHERE id = $1
    `, [reservation.user_id, now]);

    // 更新预扣凭单状态为 COMMITTED
    await tx.execute(`
      UPDATE credit_reservations
      SET status = 'COMMITTED', settled_amount = $1, creation_id = $2, settled_at = $3
      WHERE id = $4
    `, [actualCost, creationId, now, reservationId]);

    // 确认事件单独入账；预扣流水已经记录实际的负向额度，避免账本重复扣减。
    if (split.daily > 0) {
      await tx.execute(`
        INSERT INTO credit_ledger_v2
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, created_at)
        VALUES ($1, $2, 'DAILY_FREE', 0, $3, 'TASK_COMMIT', $4, $5, $6, $7)
      `, [`cl2_${randomId()}`, reservation.user_id, wallet.daily_free_credits, reservationId, `模型 ${reservation.model_id} 生成确认 (每日点数)`, `${reservation.id}:DAILY_FREE:commit`, now]);
    }

    if (split.subscription > 0) {
      await tx.execute(`
        INSERT INTO credit_ledger_v2
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, created_at)
        VALUES ($1, $2, 'SUBSCRIPTION', 0, $3, 'TASK_COMMIT', $4, $5, $6, $7)
      `, [`cl2_${randomId()}`, reservation.user_id, wallet.subscription_credits, reservationId, `模型 ${reservation.model_id} 生成确认 (订阅配额)`, `${reservation.id}:SUBSCRIPTION:commit`, now]);
    }

    if (split.perpetual > 0) {
      await tx.execute(`
        INSERT INTO credit_ledger_v2
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, created_at)
        VALUES ($1, $2, 'PERPETUAL', 0, $3, 'TASK_COMMIT', $4, $5, $6, $7)
      `, [`cl2_${randomId()}`, reservation.user_id, wallet.perpetual_credits, reservationId, `模型 ${reservation.model_id} 生成确认 (永久点数)`, `${reservation.id}:PERPETUAL:commit`, now]);
    }

    return {
      success: true,
      reservationId,
      status: RESERVATION_STATUS.COMMITTED,
      cost: actualCost,
    };
  };

  return transaction ? commit(transaction) : withTransaction(commit);
}

/**
 * Phase 2B: 两阶段撤销与原路释放 (Void / Rollback)
 * 当任务失败、内容违规或超时未成功时，将冻结额度精确原路返还
 */
export async function voidCredits({ reservationId, reason = '任务执行失败或被取消', expectedUserId = null, transaction = null }) {
  const now = nowIso();

  const release = async (tx) => {
    const reservation = await tx.queryOne(
      'SELECT * FROM credit_reservations WHERE id = $1 FOR UPDATE',
      [reservationId]
    );

    if (!reservation) {
      throw new Error('未找到该预扣凭单');
    }
    if (expectedUserId && reservation.user_id !== expectedUserId) {
      throw Object.assign(new Error('无权操作该预扣凭单'), { code: 'FORBIDDEN' });
    }

    if (reservation.status === RESERVATION_STATUS.VOIDED) {
      return { success: true, alreadyVoided: true, reservationId };
    }

    if (reservation.status !== RESERVATION_STATUS.RESERVED) {
      throw new Error(`预扣凭单状态为 ${reservation.status}，无法执行撤回`);
    }

    const reservedAmount = Number(reservation.reserved_amount);
    const split = typeof reservation.bucket_split_json === 'string'
      ? JSON.parse(reservation.bucket_split_json || '{}')
      : (reservation.bucket_split_json || {});

    // 锁定钱包，释放冻结额度并返还到各桶
    const wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [reservation.user_id]);
    const currentFrozen = Number(wallet?.frozen_credits || 0);
    const newFrozen = Math.max(0, currentFrozen - reservedAmount);

    const newDaily = Number(wallet.daily_free_credits || 0) + (split.daily || 0);
    const newSub = Number(wallet.subscription_credits || 0) + (split.subscription || 0);
    const newPerpetual = Number(wallet.perpetual_credits || 0) + (split.perpetual || 0);

    await tx.execute(`
      UPDATE credit_wallets
      SET daily_free_credits = $1,
          subscription_credits = $2,
          perpetual_credits = $3,
          frozen_credits = $4,
          version = version + 1,
          updated_at = $5
      WHERE user_id = $6
    `, [newDaily, newSub, newPerpetual, newFrozen, now, reservation.user_id]);
    await tx.execute(`
      UPDATE users
      SET credits = COALESCE((SELECT daily_free_credits + subscription_credits + perpetual_credits FROM credit_wallets WHERE user_id = $1), 0), updated_at = $2
      WHERE id = $1
    `, [reservation.user_id, now]);

    // 更新预扣状态为 VOIDED
    await tx.execute(`
      UPDATE credit_reservations
      SET status = 'VOIDED', settled_at = $1
      WHERE id = $2
    `, [now, reservationId]);

    // 按预扣时的桶拆分原路释放，账本只追加不可变的正向流水。
    const refundRows = [
      ['DAILY_FREE', split.daily, newDaily],
      ['SUBSCRIPTION', split.subscription, newSub],
      ['PERPETUAL', split.perpetual, newPerpetual],
    ];
    for (const [bucketType, bucketAmount, balanceAfter] of refundRows) {
      if (bucketAmount <= 0) continue;
      await tx.execute(`
        INSERT INTO credit_ledger_v2
          (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, created_at)
        VALUES ($1, $2, $3, $4, $5, 'TASK_RELEASE', $6, $7, $8, $9)
      `, [`cl2_${randomId()}`, reservation.user_id, bucketType, bucketAmount, balanceAfter, reservationId,
        `任务未完成解冻返还: ${reason}`, `${reservation.id}:${bucketType}:release`, now]);
    }

    return {
      success: true,
      reservationId,
      status: RESERVATION_STATUS.VOIDED,
      refundedAmount: reservedAmount,
    };
  };

  return transaction ? release(transaction) : withTransaction(release);
}

/**
 * 后台超时预扣单自动巡检 Watchdog (防止网络中断导致积分被死锁)
 */
export async function cleanupExpiredReservations() {
  const now = nowIso();
  const expiredList = await query(`
    SELECT id FROM credit_reservations
    WHERE status = 'RESERVED' AND expires_at <= $1
    LIMIT 50
  `, [now]);

  const results = [];
  for (const row of expiredList.rows) {
    try {
      const res = await voidCredits({ reservationId: row.id, reason: '生成超时未响应，系统自动解冻' });
      results.push({ id: row.id, status: 'voided', res });
    } catch (err) {
      results.push({ id: row.id, status: 'error', error: err.message });
    }
  }

  return {
    checkedCount: expiredList.rowCount,
    processed: results,
  };
}

/**
 * 发放永久算力积分 (用于卡密兑换、支付回调与管理员补发)
 */
export async function grantPerpetualCredits(userId, amount, reason = '系统充值赠送', referenceId = null, idempotencyKey = null, transaction = null) {
  const numAmount = parseInt(amount, 10);
  if (isNaN(numAmount) || numAmount <= 0) throw new Error('发放额度必须大于 0');
  const now = nowIso();

  const grant = async (tx) => {
    if (idempotencyKey) {
      const existingEntry = await tx.queryOne(
        'SELECT id, delta, balance_after FROM credit_ledger_v2 WHERE idempotency_key = $1 FOR UPDATE',
        [idempotencyKey]
      );
      if (existingEntry) {
        return { success: true, granted: Number(existingEntry.delta), perpetualCredits: Number(existingEntry.balance_after), idempotent: true };
      }
    }

    let wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!wallet) {
      await tx.execute(`
      INSERT INTO credit_wallets
        (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
      VALUES ($1, 0, 0, $2, 0, 1, $3, $4)
      ON CONFLICT (user_id) DO NOTHING
      `, [userId, numAmount, now, now]);
    } else {
      await tx.execute(`
        UPDATE credit_wallets
        SET perpetual_credits = perpetual_credits + $1, version = version + 1, updated_at = $2
        WHERE user_id = $3
      `, [numAmount, now, userId]);
    }

    const updated = await tx.queryOne('SELECT perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId]);
    const balanceAfter = Number(updated?.perpetual_credits || 0);
    await tx.execute('UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3', [balanceAfter, now, userId]);

    // 记流水
    await tx.execute(`
      INSERT INTO credit_ledger_v2
      (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, created_at)
      VALUES ($1, $2, 'PERPETUAL', $3, $4, 'CREDIT_GRANT', $5, $6, $7, $8)
    `, [`cl2_${randomId()}`, userId, numAmount, balanceAfter, referenceId, reason, idempotencyKey, now]);

    return {
      success: true,
      granted: numAmount,
      perpetualCredits: balanceAfter,
    };
  };

  return transaction ? grant(transaction) : withTransaction(grant);
}

/**
 * Reverse credits that were granted for a paid order.
 *
 * A refund must never blindly subtract from the aggregate wallet: the user
 * may already have spent some of the grant, or may have unrelated perpetual
 * credits. We therefore reverse only currently available perpetual credits,
 * record the exact immutable delta, and persist any unrecovered amount as a
 * visible obligation for operations/reconciliation.
 */
export async function reversePaymentCredits({ userId, referenceId, reason = '支付退款，撤销原订单额度', idempotencyKey, transaction = null }) {
  if (!userId || !referenceId || !idempotencyKey) throw new Error('退款额度反向记账缺少必要参数');
  const now = nowIso();

  const reverse = async (tx) => {
    const existing = await tx.queryOne(
      'SELECT delta, balance_after FROM credit_ledger_v2 WHERE idempotency_key = $1 FOR UPDATE',
      [idempotencyKey]
    );
    if (existing) return { success: true, idempotent: true, reversedAmount: Math.max(0, -Number(existing.delta || 0)), balanceAfter: Number(existing.balance_after || 0) };

    const grant = await tx.queryOne(`
      SELECT COALESCE(SUM(delta), 0)::integer AS granted_amount
      FROM credit_ledger_v2
      WHERE user_id = $1 AND reference_id = $2 AND action_type = 'CREDIT_GRANT' AND delta > 0
    `, [userId, referenceId]);
    const grantedAmount = Number(grant?.granted_amount || 0);
    const prior = await tx.queryOne(`
      SELECT COALESCE(SUM(GREATEST(0, -delta)), 0)::integer AS reversed_amount
      FROM credit_ledger_v2
      WHERE user_id = $1 AND reference_id = $2 AND action_type = 'PAYMENT_REFUND'
    `, [userId, referenceId]);
    const priorReversed = Number(prior?.reversed_amount || 0);
    const remainingGrant = Math.max(0, grantedAmount - priorReversed);

    let wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!wallet) {
      const user = await tx.queryOne('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!user) throw Object.assign(new Error('退款额度对应用户不存在'), { code: 'USER_NOT_FOUND' });
      await tx.execute(`
        INSERT INTO credit_wallets
          (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
        VALUES ($1, 0, 0, $2, 0, 1, $3, $3)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, Number(user.credits || 0), now]);
      wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    }

    const availablePerpetual = Number(wallet?.perpetual_credits || 0);
    const reversedAmount = Math.min(remainingGrant, Math.max(0, availablePerpetual));
    const nextPerpetual = availablePerpetual - reversedAmount;
    const totalAvailable = Number(wallet?.daily_free_credits || 0)
      + Number(wallet?.subscription_credits || 0) + nextPerpetual;

    await tx.execute(`
      UPDATE credit_wallets
      SET perpetual_credits = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [nextPerpetual, now, userId]);
    await tx.execute('UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3', [totalAvailable, now, userId]);

    await tx.execute(`
      INSERT INTO credit_ledger_v2
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, created_at)
      VALUES ($1, $2, 'PERPETUAL', $3, $4, 'PAYMENT_REFUND', $5, $6, $7, $8)
    `, [`cl2_${randomId()}`, userId, -reversedAmount, nextPerpetual, referenceId,
      `${reason}${remainingGrant > reversedAmount ? `（尚有 ${remainingGrant - reversedAmount} 点已消费，待对账）` : ''}`,
      idempotencyKey, now]);

    const totalReversed = priorReversed + reversedAmount;
    await tx.execute(`
      INSERT INTO credit_refund_obligations
        (id, user_id, reference_id, granted_amount, reversed_amount, status, last_idempotency_key, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)
      ON CONFLICT (user_id, reference_id) DO UPDATE SET
        granted_amount = EXCLUDED.granted_amount,
        reversed_amount = EXCLUDED.reversed_amount,
        status = EXCLUDED.status,
        last_idempotency_key = EXCLUDED.last_idempotency_key,
        updated_at = EXCLUDED.updated_at
    `, [`cro_${randomId()}`, userId, referenceId, grantedAmount, totalReversed,
      totalReversed >= grantedAmount ? 'COMPLETED' : 'PENDING', idempotencyKey, now]);

    return {
      success: true,
      reversedAmount,
      unrecoveredAmount: Math.max(0, remainingGrant - reversedAmount),
      balanceAfter: totalAvailable,
      status: totalReversed >= grantedAmount ? 'COMPLETED' : 'PENDING',
    };
  };

  return transaction ? reverse(transaction) : withTransaction(reverse);
}

export async function adjustPerpetualCredits({ userId, delta, reason, referenceId = null, actorUserId = null, idempotencyKey = null, transaction = null }) {
  const amount = Number(delta);
  if (!Number.isInteger(amount) || amount === 0) throw new Error('额度调整必须是非零整数');
  const now = nowIso();

  const adjust = async (tx) => {
    if (idempotencyKey) {
      const existing = await tx.queryOne('SELECT delta, balance_after FROM credit_ledger_v2 WHERE idempotency_key = $1 FOR UPDATE', [idempotencyKey]);
      if (existing) return { success: true, idempotent: true, userId, credits: Number(existing.balance_after), delta: Number(existing.delta) };
    }

    let wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    if (!wallet) {
      const user = await tx.queryOne('SELECT credits FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!user) throw new Error('目标用户不存在');
      await tx.execute(`
        INSERT INTO credit_wallets
          (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
        VALUES ($1, 0, 0, $2, 0, 1, $3, $3)
      `, [userId, Number(user.credits || 0), now]);
      wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    }
    const current = Number(wallet.daily_free_credits || 0) + Number(wallet.subscription_credits || 0) + Number(wallet.perpetual_credits || 0);
    const next = current + amount;
    if (next < 0) throw new Error(`扣减后额度不能小于 0（当前余额：${current}）`);

    const nextPerpetual = Number(wallet.perpetual_credits || 0) + amount;
    if (nextPerpetual < 0) throw new Error('永久额度不足，不能从已冻结或过期额度中扣减');
    await tx.execute('UPDATE credit_wallets SET perpetual_credits = $1, version = version + 1, updated_at = $2 WHERE user_id = $3', [nextPerpetual, now, userId]);
    await tx.execute('UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3', [next, now, userId]);
    const row = await tx.queryOne(`
      INSERT INTO credit_ledger_v2
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, idempotency_key, actor_user_id, created_at)
      VALUES ($1, $2, 'PERPETUAL', $3, $4, 'ADMIN_ADJUSTMENT', $5, $6, $7, $8, $9)
      RETURNING id
    `, [`cl2_${randomId()}`, userId, amount, nextPerpetual, referenceId, reason, idempotencyKey, actorUserId, now]);
    return { success: true, userId, credits: next, delta: amount, ledgerId: row.id };
  };

  return transaction ? adjust(transaction) : withTransaction(adjust);
}
