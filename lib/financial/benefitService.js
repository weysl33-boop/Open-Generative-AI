import 'server-only';

import { withTransaction, nowIso, randomId } from '../db/index.js';
import { ACCOUNT_CODES } from './constants.js';
import { AVATAR_FRAMES, findBenefit } from '../benefits/catalog.js';

function ensureIdempotencyKey(idempotencyKey) {
  if (!idempotencyKey || String(idempotencyKey).trim().length < 8) {
    throw Object.assign(new Error('兑换操作必须提供有效的幂等键'), { code: 'IDEMPOTENCY_REQUIRED' });
  }
  return String(idempotencyKey).trim();
}

/**
 * 业务错误必须带 code，否则 publicErrorMessage 的白名单会把它压成通用文案，
 * 用户点了下架项目只会看到"兑换失败，请稍后重试"，管理员也无从判断原因。
 */
function domainError(code, message) {
  return Object.assign(new Error(message), { code });
}

const BUSINESS_CODES = new Set(['WALLET_LOCKED', 'INSUFFICIENT_COINS', 'BENEFIT_ALREADY_OWNED', 'BENEFIT_NOT_OWNED']);

/**
 * withTransaction 会把回调里的异常包成 "PostgreSQL transaction failed: …"，
 * 而带数据库字样的文案会被 publicErrorMessage 压成通用提示，用户点错只会看到"兑换失败"。
 * 业务错误按原样重抛，前端才读得出"余额不足 / 已拥有"。
 */
async function runBusinessTransaction(callback) {
  try {
    return await withTransaction(callback);
  } catch (error) {
    const cause = error?.cause;
    if (cause?.code && BUSINESS_CODES.has(cause.code)) throw cause;
    throw error;
  }
}

/**
 * 消耗硬币并落一笔复式分录：借 2001 (用户负债减少) / 贷 4002 (站内权益履约成本)。
 * 调用方必须已经锁定钱包行并校验过余额。
 */
async function debitCoins(tx, { userId, coins, benefit, idempotencyKey, txId, now }) {
  const wallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
  const available = Number(wallet?.available_balance || 0);
  if (wallet?.is_locked) throw domainError('WALLET_LOCKED', '钱包已被冻结，暂不可兑换');
  if (available < coins) {
    throw domainError('INSUFFICIENT_COINS', `硬币余额不足，本次需要 ${coins} 枚，当前可用 ${available.toFixed(2)} 枚`);
  }
  const balanceAfter = Number((available - coins).toFixed(4));

  await tx.execute(`
    INSERT INTO currency_journal_entries
    (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
    VALUES ($1, $2, $3, $4, 'DEBIT', $5, $6, 'BENEFIT_REDEEM', $7, $8, $9, $10)
  `, [`cje_${randomId()}`, txId, userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, coins, balanceAfter, benefit.id, idempotencyKey, `兑换 ${benefit.title}`, now]);

  await tx.execute(`
    INSERT INTO currency_journal_entries
    (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
    VALUES ($1, $2, null, $3, 'CREDIT', $4, null, 'BENEFIT_REDEEM', $5, $6, $7, $8)
  `, [`cje_${randomId()}`, txId, ACCOUNT_CODES.REVENUE_FULFILLMENT, coins, benefit.id, `${idempotencyKey}:rev`, `${benefit.title} 履约消耗`, now]);

  await tx.execute(`
    UPDATE currency_wallets
    SET available_balance = $1, version = version + 1, updated_at = $2
    WHERE user_id = $3
  `, [balanceAfter, now, userId]);

  return { balanceAfter };
}

/**
 * 硬币兑换站内权益。两种效果都是真实落库的：
 * 加速卡写 priority_until 让出队顺序前移；头像框写入永久拥有列表并直接佩戴。
 * 硬币不参与算力积分的购买，算力只能通过订阅与算力包获得。
 */
export async function redeemBenefit({ userId, benefitId, idempotencyKey }) {
  const benefit = findBenefit(benefitId);
  if (!benefit) throw domainError('BENEFIT_UNAVAILABLE', '兑换项目不存在或已下架');
  const key = ensureIdempotencyKey(idempotencyKey);

  const now = nowIso();
  const txId = `tx_ben_${randomId()}`;

  const result = await runBusinessTransaction(async (tx) => {
    const existing = await tx.queryOne(
      'SELECT transaction_id FROM currency_journal_entries WHERE idempotency_key = $1 AND user_id = $2',
      [key, userId],
    );
    if (existing) return { idempotent: true, transactionId: existing.transaction_id };

    await tx.execute(`
      INSERT INTO currency_wallets
      (user_id, available_balance, frozen_balance, restricted_balance, is_locked, version, updated_at, created_at)
      VALUES ($1, 0.0000, 0.0000, 0.0000, FALSE, 1, $2, $3)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId, now, now]);

    if (benefit.kind === 'avatar_frame') {
      const row = await tx.queryOne('SELECT avatar_frames FROM users WHERE id = $1 FOR UPDATE', [userId]);
      if (!row) throw new Error('用户不存在');
      if ((row.avatar_frames || []).includes(benefit.frame)) {
        throw domainError('BENEFIT_ALREADY_OWNED', `你已拥有${AVATAR_FRAMES[benefit.frame]?.label || '该头像框'}，无需重复兑换`);
      }
      const { balanceAfter } = await debitCoins(tx, { userId, coins: benefit.coins, benefit, idempotencyKey: key, txId, now });
      await tx.execute(`
        UPDATE users
        SET avatar_frames = array_append(avatar_frames, $1),
            avatar_frame = $1,
            updated_at = $2
        WHERE id = $3
      `, [benefit.frame, now, userId]);
      return { balanceAfter, frame: benefit.frame };
    }

    // 加速卡：按剩余时长顺延叠加，未到期不重置
    const row = await tx.queryOne('SELECT priority_until FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!row) throw new Error('用户不存在');
    const { balanceAfter } = await debitCoins(tx, { userId, coins: benefit.coins, benefit, idempotencyKey: key, txId, now });
    const currentUntil = row.priority_until && new Date(row.priority_until) > new Date(now)
      ? new Date(row.priority_until)
      : new Date(now);
    const priorityUntil = new Date(currentUntil.getTime() + benefit.hours * 3600000).toISOString();
    await tx.execute('UPDATE users SET priority_until = $1, updated_at = $2 WHERE id = $3', [priorityUntil, now, userId]);
    return { balanceAfter, priorityUntil, hours: benefit.hours };
  });

  return { benefit, result: { ...result, transactionId: result.transactionId || txId } };
}

/** 佩戴已拥有的头像框，frame 传 null 表示摘下。 */
export async function wearAvatarFrame({ userId, frame }) {
  const now = nowIso();
  if (frame === null || frame === '') {
    await withTransaction(async (tx) => {
      await tx.execute('UPDATE users SET avatar_frame = NULL, updated_at = $1 WHERE id = $2', [now, userId]);
    });
    return { avatarFrame: null };
  }
  if (!AVATAR_FRAMES[frame]) throw domainError('BENEFIT_UNAVAILABLE', '头像框不存在');

  return await runBusinessTransaction(async (tx) => {
    const row = await tx.queryOne('SELECT avatar_frames FROM users WHERE id = $1 FOR UPDATE', [userId]);
    if (!(row?.avatar_frames || []).includes(frame)) throw domainError('BENEFIT_NOT_OWNED', '尚未拥有该头像框，请先用硬币兑换');
    await tx.execute('UPDATE users SET avatar_frame = $1, updated_at = $2 WHERE id = $3', [frame, now, userId]);
    return { avatarFrame: frame };
  });
}
