import 'server-only';

import { queryOne, execute, withTransaction, nowIso, randomId } from '../db/index.js';
import { ACCOUNT_CODES, CURRENCY } from './constants.js';
import { grantPerpetualCredits } from './creditService.js';
import { getPlan } from '../billing.js';

/**
 * 平台通用货币 K-Coin 兑换永久 AI 算力积分
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} params.coinAmount - 消耗的 K 币数量
 * @param {string} params.idempotencyKey
 */
export async function exchangeCoinToCredits({ userId, coinAmount, idempotencyKey = null }) {
  const numCoins = Number(Number(coinAmount).toFixed(4));
  if (isNaN(numCoins) || numCoins <= 0) {
    throw new Error('兑换 K 币数量必须大于 0');
  }

  const creditsGained = Math.floor(numCoins * CURRENCY.COIN_TO_CREDITS_RATE);
  if (creditsGained <= 0) {
    throw new Error('兑换所得积分数额不足 1');
  }

  const txId = `tx_ex_${randomId()}`;
  const now = nowIso();

  return await withTransaction(async (tx) => {
    // 幂等校验
    if (idempotencyKey) {
      const existing = await tx.queryOne(
        'SELECT * FROM currency_journal_entries WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existing) {
        return { success: true, idempotent: true, creditsGained, transactionId: existing.transaction_id };
      }
    }

    // 锁定货币钱包
    const currWallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [userId]);
    if (!currWallet || currWallet.is_locked) {
      throw new Error('货币钱包不可用或已被冻结');
    }

    const available = Number(currWallet.available_balance || 0);
    if (available < numCoins) {
      throw new Error(`K 币可用余额不足！当前可用 ${available.toFixed(2)} K币，需要 ${numCoins} K币`);
    }

    // 1. 扣减 K 币可用余额
    const newCoinBal = Number((available - numCoins).toFixed(4));
    await tx.execute(`
      UPDATE currency_wallets
      SET available_balance = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [newCoinBal, now, userId]);

    // 2. 复式记账分录：借 2001 (用户负债减少)，贷 4002 (算力履约收入确认)
    const entryIdLiability = `cje_${randomId()}`;
    const entryIdRevenue = `cje_${randomId()}`;

    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
      VALUES ($1, $2, $3, $4, 'DEBIT', $5, $6, 'EXCHANGE_CREDITS', $7, $8, $9, $10)
    `, [entryIdLiability, txId, userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, numCoins, newCoinBal, txId, idempotencyKey, `兑换 ${creditsGained} 算力点消耗 ${numCoins} K币`, now]);

    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
      VALUES ($1, $2, null, $3, 'CREDIT', $4, null, 'EXCHANGE_CREDITS', $5, $6, $7, $8)
    `, [entryIdRevenue, txId, ACCOUNT_CODES.REVENUE_FULFILLMENT, numCoins, txId, idempotencyKey ? `${idempotencyKey}_rev` : null, `兑换履约确认收入`, now]);

    // 3. 增加永久算力积分
    let creditWallet = await tx.queryOne('SELECT * FROM credit_wallets WHERE user_id = $1', [userId]);
    if (!creditWallet) {
      await tx.execute(`
        INSERT INTO credit_wallets
        (user_id, daily_free_credits, subscription_credits, perpetual_credits, frozen_credits, version, updated_at, created_at)
        VALUES ($1, 0, 0, $2, 0, 1, $3, $4)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, creditsGained, now, now]);
    } else {
      await tx.execute(`
        UPDATE credit_wallets
        SET perpetual_credits = perpetual_credits + $1, version = version + 1, updated_at = $2
        WHERE user_id = $3
      `, [creditsGained, now, userId]);
    }

    const updatedCreditWallet = await tx.queryOne('SELECT perpetual_credits FROM credit_wallets WHERE user_id = $1', [userId]);
    const newCreditBal = Number(updatedCreditWallet?.perpetual_credits || 0);

    // 4. 记录积分明细
    await tx.execute(`
      INSERT INTO credit_ledger_v2
      (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, created_at)
      VALUES ($1, $2, 'PERPETUAL', $3, $4, 'COIN_EXCHANGE', $5, $6, $7)
    `, [`cl2_${randomId()}`, userId, creditsGained, newCreditBal, txId, `使用 ${numCoins} K币兑换 ${creditsGained} 算力点`, now]);

    return {
      success: true,
      transactionId: txId,
      spentCoins: numCoins,
      creditsGained,
      coinBalanceAfter: newCoinBal,
      creditBalanceAfter: newCreditBal,
    };
  });
}

/**
 * 平台通用货币 K-Coin 购买 / 续订 VIP 会员
 * @param {Object} params
 * @param {string} params.userId
 * @param {string} params.planId - 'pro' | 'team'
 */
export async function buyVipWithCoin({ userId, planId, idempotencyKey = null }) {
  const plan = getPlan(planId);
  if (!plan || plan.id === 'free') {
    throw new Error('请选择有效的付费会员套餐');
  }

  // 计算所需 K 币（月度单价 * 10）
  const requiredCoins = Number((plan.monthlyCny * CURRENCY.CNY_TO_COIN_RATE).toFixed(4));
  const txId = `tx_vip_${randomId()}`;
  const now = nowIso();
  const periodEnd = new Date(Date.now() + 30 * 86400000).toISOString();

  // 会员每月附赠算力积分（Pro 赠 300 积分，Team 赠 1500 积分）
  const subCreditsBonus = plan.id === 'pro' ? 300 : (plan.id === 'team' ? 1500 : 0);

  return await withTransaction(async (tx) => {
    const currWallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [userId]);
    if (!currWallet || currWallet.is_locked) {
      throw new Error('货币钱包不可用或已被冻结');
    }

    const available = Number(currWallet.available_balance || 0);
    if (available < requiredCoins) {
      throw new Error(`K 币可用余额不足！开通 ${plan.name} 需要 ${requiredCoins} K币，当前可用 ${available.toFixed(2)} K币`);
    }

    // 1. 扣减 K 币
    const newCoinBal = Number((available - requiredCoins).toFixed(4));
    await tx.execute(`
      UPDATE currency_wallets
      SET available_balance = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [newCoinBal, now, userId]);

    // 2. 复式记账分录
    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
      VALUES ($1, $2, $3, $4, 'DEBIT', $5, $6, 'BUY_VIP', $7, $8, $9, $10)
    `, [`cje_${randomId()}`, txId, userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, requiredCoins, newCoinBal, txId, idempotencyKey, `开通会员 ${plan.name} (30天)`, now]);

    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
      VALUES ($1, $2, null, $3, 'CREDIT', $4, null, 'BUY_VIP', $5, $6, $7, $8)
    `, [`cje_${randomId()}`, txId, ACCOUNT_CODES.REVENUE_FULFILLMENT, requiredCoins, txId, idempotencyKey ? `${idempotencyKey}_rev` : null, `开通 ${plan.name} 会员履约收入`, now]);

    // 3. 更新或创建订阅记录 subscriptions
    const subId = `sub_${randomId()}`;
    await tx.execute(`
      INSERT INTO subscriptions
      (id, user_id, provider, provider_customer_id, provider_subscription_id, plan_id, status, current_period_end, cancel_at_period_end, last_synced_at, version, created_at, updated_at)
      VALUES ($1, $2, 'kcoin', $3, $4, $5, 'active', $6, 0, $7, 1, $8, $9)
    `, [subId, userId, `cus_${userId}`, txId, plan.id, periodEnd, now, now, now]);

    // 4. 派发月度订阅算力点数到订阅桶 (30天过期)
    if (subCreditsBonus > 0) {
      await tx.execute(`
        UPDATE credit_wallets
        SET subscription_credits = subscription_credits + $1,
            subscription_expires_at = $2,
            version = version + 1,
            updated_at = $3
        WHERE user_id = $4
      `, [subCreditsBonus, periodEnd, now, userId]);

      await tx.execute(`
        INSERT INTO credit_ledger_v2
        (id, user_id, bucket_type, delta, balance_after, action_type, reference_id, description, created_at)
        VALUES ($1, $2, 'SUBSCRIPTION', $3, $4, 'VIP_GRANT', $5, $6, $7)
      `, [`cl2_${randomId()}`, userId, subCreditsBonus, subCreditsBonus, txId, `开通 ${plan.name} 附赠 ${subCreditsBonus} 算力点`, now]);
    }

    return {
      success: true,
      planId: plan.id,
      planName: plan.name,
      spentCoins: requiredCoins,
      subCreditsBonus,
      periodEnd,
    };
  });
}
