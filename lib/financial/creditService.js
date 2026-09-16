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
      INSERT OR IGNORE INTO credit_wallets 
      (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
      VALUES ($1, 0, 0, $2, 0, 1, $3, $4)
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
    // 1. 检查今天是否已签到
    const existing = await tx.queryOne(`
      SELECT id FROM credit_ledger_v2 
      WHERE user_id = $1 AND action_type = 'DAILY_CHECKIN' AND created_at >= $2
      LIMIT 1
    `, [userId, todayStart.toISOString()]);

    if (existing) {
      throw new Error('今日已完成签到，请明天再来');
    }

    // 2. 锁定钱包
    let wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [userId]);
    if (!wallet) {
      await tx.execute(`
        INSERT OR IGNORE INTO credit_wallets 
        (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
        VALUES ($1, 0, 0, 0, 0, 1, $2, $3)
      `, [userId, now.toISOString(), now.toISOString()]);
      wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [userId]);
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

    // 4. 记账流水
    const ledgerId = `cl2_${randomId()}`;
    await tx.execute(`
      INSERT INTO credit_ledger_v2 
      (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, created_at)
      VALUES ($1, $2, 'DAILY_FREE', $3, $4, 'DAILY_CHECKIN', null, $5, $6)
    `, [ledgerId, userId, DAILY_CHECKIN_REWARD, newDaily, `每日签到赠送 ${DAILY_CHECKIN_REWARD} 算力点 (今日有效)`, now.toISOString()]);

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
export async function reserveCredits({ userId, amount, modelId, studioId = 'studio', idempotencyKey }) {
  const reqAmount = parseInt(amount, 10);
  if (isNaN(reqAmount) || reqAmount <= 0) {
    throw new Error('预扣额度必须大于 0');
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + RESERVATION_TTL_MINUTES * 60 * 1000);

  return await withTransaction(async (tx) => {
    // 幂等防重
    if (idempotencyKey) {
      const existing = await tx.queryOne(
        'SELECT * FROM credit_reservations WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existing) {
        return {
          reservationId: existing.id,
          status: existing.status,
          reservedAmount: existing.reserved_amount,
          idempotent: true,
        };
      }
    }

    // 锁定钱包
    let wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [userId]);
    if (!wallet) {
      const nowStr = now.toISOString();
      await tx.execute(`
        INSERT OR IGNORE INTO credit_wallets 
        (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
        VALUES ($1, 0, 0, 0, 0, 1, $2, $3)
      `, [userId, nowStr, nowStr]);
      wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [userId]);
    }

    const normalized = normalizeWalletBuckets(wallet, now);
    const { isSufficient, split } = computeSplitDeduction(normalized, reqAmount);

    if (!isSufficient) {
      throw new Error(`算力点数不足！本次生成需要 ${reqAmount} 积分，当前可用 ${normalized.totalAvailable} 积分`);
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

    // 写入预扣单
    const reservationId = `res_${randomId()}`;
    await tx.execute(`
      INSERT INTO credit_reservations 
      (id, user_id, studio_id, model_id, reserved_amount, settled_amount, bucket_split_json, status, idempotency_key, expires_at, created_at)
      VALUES ($1, $2, $3, $4, $5, 0, $6, 'RESERVED', $7, $8, $9)
    `, [reservationId, userId, studioId, modelId, reqAmount, JSON.stringify(split), idempotencyKey || reservationId, expiresAt.toISOString(), now.toISOString()]);

    return {
      reservationId,
      status: RESERVATION_STATUS.RESERVED,
      reservedAmount: reqAmount,
      split,
      expiresAt: expiresAt.toISOString(),
    };
  });
}

/**
 * Phase 2A: 两阶段确认结算 (Commit)
 * AI 任务生成成功后，将冻结资金正式核销扣除
 */
export async function commitCredits({ reservationId, creationId = null, settledAmount = null }) {
  const now = nowIso();

  return await withTransaction(async (tx) => {
    const reservation = await tx.queryOne(
      'SELECT * FROM credit_reservations WHERE id = $1',
      [reservationId]
    );

    if (!reservation) {
      throw new Error('未找到该预冻结凭单');
    }

    if (reservation.status === RESERVATION_STATUS.COMMITTED) {
      return { success: true, alreadyCommitted: true, reservationId };
    }

    if (reservation.status !== RESERVATION_STATUS.RESERVED) {
      throw new Error(`预扣凭单状态为 ${reservation.status}，无法执行结算`);
    }

    const reservedAmount = Number(reservation.reserved_amount);
    const actualCost = settledAmount !== null ? Math.min(Number(settledAmount), reservedAmount) : reservedAmount;
    const split = JSON.parse(reservation.bucket_split_json || '{}');

    // 锁定钱包，扣减 frozen_credits
    const wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [reservation.user_id]);
    const currentFrozen = Number(wallet?.frozen_credits || 0);
    const newFrozen = Math.max(0, currentFrozen - reservedAmount);

    await tx.execute(`
      UPDATE credit_wallets 
      SET frozen_credits = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [newFrozen, now, reservation.user_id]);

    // 更新预扣凭单状态为 COMMITTED
    await tx.execute(`
      UPDATE credit_reservations 
      SET status = 'COMMITTED', settled_amount = $1, creation_id = $2, settled_at = $3
      WHERE id = $4
    `, [actualCost, creationId, now, reservationId]);

    // 针对各个桶分别写入正式消耗流水
    if (split.daily > 0) {
      await tx.execute(`
        INSERT INTO credit_ledger_v2 
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, created_at)
        VALUES ($1, $2, 'DAILY_FREE', $3, $4, 'TASK_CONSUME', $5, $6, $7)
      `, [`cl2_${randomId()}`, reservation.user_id, -split.daily, wallet.daily_free_credits, reservationId, `模型 ${reservation.model_id} 生成消耗 (每日点数)`, now]);
    }

    if (split.subscription > 0) {
      await tx.execute(`
        INSERT INTO credit_ledger_v2 
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, created_at)
        VALUES ($1, $2, 'SUBSCRIPTION', $3, $4, 'TASK_CONSUME', $5, $6, $7)
      `, [`cl2_${randomId()}`, reservation.user_id, -split.subscription, wallet.subscription_credits, reservationId, `模型 ${reservation.model_id} 生成消耗 (订阅配额)`, now]);
    }

    if (split.perpetual > 0) {
      await tx.execute(`
        INSERT INTO credit_ledger_v2 
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, created_at)
        VALUES ($1, $2, 'PERPETUAL', $3, $4, 'TASK_CONSUME', $5, $6, $7)
      `, [`cl2_${randomId()}`, reservation.user_id, -split.perpetual, wallet.perpetual_credits, reservationId, `模型 ${reservation.model_id} 生成消耗 (永久点数)`, now]);
    }

    return {
      success: true,
      reservationId,
      status: RESERVATION_STATUS.COMMITTED,
      cost: actualCost,
    };
  });
}

/**
 * Phase 2B: 两阶段撤销与原路释放 (Void / Rollback)
 * 当任务失败、内容违规或超时未成功时，将冻结额度精确原路返还
 */
export async function voidCredits({ reservationId, reason = '任务执行失败或被取消' }) {
  const now = nowIso();

  return await withTransaction(async (tx) => {
    const reservation = await tx.queryOne(
      'SELECT * FROM credit_reservations WHERE id = $1',
      [reservationId]
    );

    if (!reservation) {
      throw new Error('未找到该预扣凭单');
    }

    if (reservation.status === RESERVATION_STATUS.VOIDED) {
      return { success: true, alreadyVoided: true, reservationId };
    }

    if (reservation.status !== RESERVATION_STATUS.RESERVED) {
      throw new Error(`预扣凭单状态为 ${reservation.status}，无法执行撤回`);
    }

    const reservedAmount = Number(reservation.reserved_amount);
    const split = JSON.parse(reservation.bucket_split_json || '{}');

    // 锁定钱包，释放冻结额度并返还到各桶
    const wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [reservation.user_id]);
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

    // 更新预扣状态为 VOIDED
    await tx.execute(`
      UPDATE credit_reservations 
      SET status = 'VOIDED', settled_at = $1
      WHERE id = $2
    `, [now, reservationId]);

    // 记录解冻退还流水
    const refundId = `cl2_${randomId()}`;
    await tx.execute(`
      INSERT INTO credit_ledger_v2 
      (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, created_at)
      VALUES ($1, $2, 'PERPETUAL', $3, $4, 'TASK_REFUND', $5, $6, $7)
    `, [refundId, reservation.user_id, reservedAmount, newPerpetual, reservationId, `任务未完成解冻返还: ${reason}`, now]);

    return {
      success: true,
      reservationId,
      status: RESERVATION_STATUS.VOIDED,
      refundedAmount: reservedAmount,
    };
  });
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
 * 发放永久算力积分 (用于 K 币兑换、卡密兑换、管理员补发)
 */
export async function grantPerpetualCredits(userId, amount, reason = '系统充值赠送', referenceId = null) {
  const numAmount = parseInt(amount, 10);
  if (isNaN(numAmount) || numAmount <= 0) throw new Error('发放额度必须大于 0');
  const now = nowIso();

  return await withTransaction(async (tx) => {
    let wallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [userId]);
    if (!wallet) {
      await tx.execute(`
        INSERT OR IGNORE INTO credit_wallets 
        (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
        VALUES ($1, 0, 0, $2, 0, 1, $3, $4)
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

    // 记流水
    await tx.execute(`
      INSERT INTO credit_ledger_v2 
      (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, created_at)
      VALUES ($1, $2, 'PERPETUAL', $3, $4, 'COIN_EXCHANGE', $5, $6, $7)
    `, [`cl2_${randomId()}`, userId, numAmount, balanceAfter, referenceId, reason, now]);

    return {
      success: true,
      granted: numAmount,
      perpetualCredits: balanceAfter,
    };
  });
}
