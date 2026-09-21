import 'server-only';

import { query, queryOne, execute, withTransaction, nowIso, randomId } from '../db/index.js';
import { ACCOUNT_CODES, CURRENCY } from './constants.js';

/**
 * 获取或初始化用户硬币钱包
 */
export async function getCurrencyWallet(userId) {
  if (!userId) return null;
  let wallet = await queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [userId]);
  if (!wallet) {
    const now = nowIso();
    await execute(`
      INSERT INTO currency_wallets
      (user_id, available_balance, frozen_balance, restricted_balance, is_locked, version, updated_at, created_at)
      VALUES ($1, 0.0000, 0.0000, 0.0000, FALSE, 1, $2, $3)
      ON CONFLICT (user_id) DO NOTHING
    `, [userId, now, now]);
    wallet = await queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [userId]);
  }

  return {
    userId: wallet.user_id,
    availableBalance: Number(wallet.available_balance || 0),
    frozenBalance: Number(wallet.frozen_balance || 0),
    restrictedBalance: Number(wallet.restricted_balance || 0),
    totalBalance: Number(wallet.available_balance || 0) + Number(wallet.restricted_balance || 0),
    isLocked: Boolean(wallet.is_locked),
    updatedAt: wallet.updated_at,
  };
}

/**
 * 审核通过后向建议提交人发放硬币（站内第二条发行通道）。
 *
 * 幂等键固定为 feedback:<id>：同一笔建议无论被点多少次「发放」，只会铸一次币。
 */
export async function grantFeedbackRewardCoins({ userId, feedbackId, amount, note }) {
  if (!userId || !feedbackId) throw new Error('缺少提交人或建议标识');
  const coins = Number(Number(amount).toFixed(4));
  if (!Number.isFinite(coins) || coins <= 0) throw new Error('发放硬币数量必须大于 0');

  const idempotencyKey = `feedback:${feedbackId}:reward`;

  return await withTransaction(async (tx) => {
    const existing = await tx.queryOne(
      'SELECT transaction_id, amount FROM currency_journal_entries WHERE idempotency_key = $1',
      [idempotencyKey],
    );
    if (existing) {
      return {
        success: true,
        idempotent: true,
        amount: Number(existing.amount),
        transactionId: existing.transaction_id,
      };
    }

    const now = nowIso();
    let wallet = await tx.queryOne(
      'SELECT * FROM currency_wallets WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    if (!wallet) {
      await tx.execute(`
        INSERT INTO currency_wallets
        (user_id, available_balance, frozen_balance, restricted_balance, is_locked, version, updated_at, created_at)
        VALUES ($1, 0.0000, 0.0000, 0.0000, FALSE, 1, $2, $3)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, now, now]);
      wallet = await tx.queryOne(
        'SELECT * FROM currency_wallets WHERE user_id = $1 FOR UPDATE',
        [userId],
      );
    }
    if (wallet.is_locked) throw new Error('提交人钱包已被风控锁定，无法发放硬币');

    const newBalance = Number((Number(wallet.available_balance || 0) + coins).toFixed(4));
    const txId = `tx_fb_${randomId()}`;

    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
      VALUES ($1, $2, $3, $4, 'CREDIT', $5, $6, 'FEEDBACK_REWARD', $7, $8, $9, $10)
    `, [`cje_${randomId()}`, txId, userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, coins, newBalance, String(feedbackId), idempotencyKey, note || '有效建议 / 报错 / 漏洞提交奖励', now]);

    await tx.execute(`
      UPDATE currency_wallets
      SET available_balance = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [newBalance, now, userId]);

    return { success: true, amount: coins, balanceAfter: newBalance, transactionId: txId };
  });
}

/**
 * 查询用户的硬币余额变动流水。
 * 只取 2001（用户可用硬币负债）分录：配对的 4002 履约收入是平台侧账，
 * 混进来会让一笔消耗在明细里出现两条，用户看到的双倍扣减并不存在。
 */
export async function getCurrencyLedger(userId, { limit = 20, offset = 0 } = {}) {
  const rows = await query(`
    SELECT id, transaction_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at
    FROM currency_journal_entries
    WHERE user_id = $1 AND account_code = $2
    ORDER BY created_at DESC
    LIMIT $3 OFFSET $4
  `, [userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, limit, offset]);

  return rows.rows.map(r => ({
    id: r.id,
    transactionId: r.transaction_id,
    direction: r.direction,
    amount: Number(r.amount),
    balanceAfter: r.balance_after ? Number(r.balance_after) : null,
    bizType: r.biz_type,
    bizId: r.biz_id,
    description: r.description,
    createdAt: r.created_at,
  }));
}

/**
 * 获取用户今日登录领币状态 (参考 B 站硬币：每日登录发放 1 枚硬币)
 */
export async function getDailyLoginStatus(userId) {
  if (!userId) {
    return { claimed: false, canClaim: false, balance: 0, reward: CURRENCY.DAILY_LOGIN_REWARD };
  }
  const wallet = await getCurrencyWallet(userId);
  const todayEntry = await queryOne(`
    SELECT id, created_at
    FROM currency_journal_entries
    WHERE user_id = $1 
      AND biz_type = 'DAILY_LOGIN'
      AND created_at >= CURRENT_DATE AT TIME ZONE 'Asia/Shanghai'
    LIMIT 1
  `, [userId]);

  const claimed = Boolean(todayEntry);
  return {
    claimed,
    canClaim: !claimed,
    balance: wallet ? wallet.availableBalance : 0,
    reward: CURRENCY.DAILY_LOGIN_REWARD,
  };
}

/**
 * 领取每日登录奖励 1 枚硬币
 */
export async function claimDailyLoginCoin(userId) {
  if (!userId) throw new Error('用户未登录');

  return await withTransaction(async (tx) => {
    let wallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    const now = nowIso();
    if (!wallet) {
      await tx.execute(`
        INSERT INTO currency_wallets
        (user_id, available_balance, frozen_balance, restricted_balance, is_locked, version, updated_at, created_at)
        VALUES ($1, 0.0000, 0.0000, 0.0000, FALSE, 1, $2, $3)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, now, now]);
      wallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
    }

    // 判重必须在加锁之后：否则两个并发请求都会读到"今天还没领"，然后排队各自加一次。
    const todayEntry = await tx.queryOne(`
      SELECT id, created_at
      FROM currency_journal_entries
      WHERE user_id = $1
        AND biz_type = 'DAILY_LOGIN'
        AND created_at >= CURRENT_DATE AT TIME ZONE 'Asia/Shanghai'
      LIMIT 1
    `, [userId]);

    if (todayEntry) {
      return {
        success: true,
        claimed: true,
        isFirstToday: false,
        amount: 0,
        balance: Number(wallet.available_balance || 0),
        message: '今日登录奖励已领取',
      };
    }

    const rewardAmount = CURRENCY.DAILY_LOGIN_REWARD || 1;
    const newBalance = Number((Number(wallet.available_balance || 0) + rewardAmount).toFixed(4));
    const txId = `tx_log_${randomId()}`;
    const entryIdLiability = `cje_${randomId()}`;

    // 复式记账分录：贷 2001 (用户可用代币负债增加)
    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at)
      VALUES ($1, $2, $3, $4, 'CREDIT', $5, $6, 'DAILY_LOGIN', $7, $8, $9)
    `, [entryIdLiability, txId, userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, rewardAmount, newBalance, `login_${new Date().toISOString().slice(0, 10)}`, `每日登录打卡赠送 ${rewardAmount} 枚硬币`, now]);

    // 更新钱包可用余额
    await tx.execute(`
      UPDATE currency_wallets
      SET available_balance = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [newBalance, now, userId]);

    return {
      success: true,
      claimed: true,
      isFirstToday: true,
      amount: rewardAmount,
      balance: newBalance,
      message: '成功领取今日登录奖励 1 枚硬币！',
    };
  });
}

/**
 * 给社区作品投币 (参考 B 站硬币：单次 1 或 2 枚，单个作品累计最多 2 枚，不能给自己投币)。
 *
 * 投出的硬币只做消耗，不给作品作者增加余额 —— 站内获取硬币的渠道只有每日登录，
 * 以及经人工审核认定的有效建议 / 报错 / 漏洞提交。
 */
export async function tipPostCoins({ userId, postId, amount = 1 }) {
  if (!userId) throw new Error('请先登录');
  const coinNum = parseInt(amount, 10);
  if (coinNum !== 1 && coinNum !== 2) {
    throw new Error('单次投币仅支持 1 或 2 枚硬币');
  }

  // 1. 查询作品信息
  const post = await queryOne(`
    SELECT id, user_id, title, COALESCE(coins_count, 0) as coins_count
    FROM ai_studio.community_posts
    WHERE id = $1
  `, [postId]);

  if (!post) {
    throw new Error('作品不存在或已被删除');
  }

  if (post.user_id === userId) {
    throw new Error('不能给自己的作品投币哦');
  }

  return await withTransaction(async (tx) => {
    // 2. 查询当前用户对该作品的历史投币累计
    const tippedRow = await tx.queryOne(`
      SELECT COALESCE(SUM(amount), 0) as total_tipped
      FROM currency_journal_entries
      WHERE user_id = $1 AND biz_type = 'POST_COIN_TIP' AND biz_id = $2
    `, [userId, String(postId)]);

    const alreadyTipped = Number(tippedRow?.total_tipped || 0);
    if (alreadyTipped + coinNum > CURRENCY.MAX_POST_TIP_COINS) {
      const remainingLimit = Math.max(0, CURRENCY.MAX_POST_TIP_COINS - alreadyTipped);
      throw new Error(`每位用户对同一作品最多投 ${CURRENCY.MAX_POST_TIP_COINS} 枚硬币，您已投 ${alreadyTipped} 枚，本次最多还可投 ${remainingLimit} 枚`);
    }

    // 3. 锁定投币人钱包并校验余额
    const now = nowIso();
    const wallet = await tx.queryOne(
      'SELECT * FROM currency_wallets WHERE user_id = $1 FOR UPDATE',
      [userId],
    );
    if (!wallet || wallet.is_locked) {
      throw new Error('您的钱包已被锁定，无法投币');
    }

    const available = Number(wallet.available_balance || 0);
    if (available < coinNum) {
      throw new Error('您的硬币余额不足，可通过每日登录或提交有效建议获取');
    }

    const senderNewBalance = Number((available - coinNum).toFixed(4));
    const txId = `tx_tip_${randomId()}`;
    const postTitle = (post.title || '无题').slice(0, 20);

    // 4. 复式分录：借 2001 (投币人负债减少)，贷 4002 (投币即消耗，确认站内权益履约成本)
    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at)
      VALUES ($1, $2, $3, $4, 'DEBIT', $5, $6, 'POST_COIN_TIP', $7, $8, $9)
    `, [`cje_${randomId()}`, txId, userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, coinNum, senderNewBalance, String(postId), `给作品《${postTitle}》投币 ${coinNum} 枚`, now]);

    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at)
      VALUES ($1, $2, null, $3, 'CREDIT', $4, null, 'POST_COIN_TIP', $5, $6, $7)
    `, [`cje_${randomId()}`, txId, ACCOUNT_CODES.REVENUE_FULFILLMENT, coinNum, String(postId), `作品《${postTitle}》投币消耗`, now]);

    // 5. 扣减投币人余额
    await tx.execute(`
      UPDATE currency_wallets
      SET available_balance = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [senderNewBalance, now, userId]);

    // 6. 作品投币数只做展示累计，不形成作者的硬币收入
    await tx.execute(`
      UPDATE ai_studio.community_posts
      SET coins_count = COALESCE(coins_count, 0) + $1
      WHERE id = $2
    `, [coinNum, postId]);

    const newPostCoins = Number(post.coins_count || 0) + coinNum;

    return {
      success: true,
      postId,
      amount: coinNum,
      userTippedTotal: alreadyTipped + coinNum,
      totalCoins: newPostCoins,
      remainingBalance: senderNewBalance,
      message: `成功投出 ${coinNum} 枚硬币，感谢支持！`,
    };
  });
}

