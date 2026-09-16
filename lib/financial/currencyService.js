import 'server-only';

import crypto from 'node:crypto';
import { query, queryOne, execute, withTransaction, nowIso, randomId } from '../db/index.js';
import { ACCOUNT_CODES, CURRENCY, RISK_RULES } from './constants.js';

function hashPayPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const derived = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return { salt, hash: derived };
}

function verifyPayPasswordHash(password, storedHash, storedSalt) {
  if (!password || !storedHash || !storedSalt) return false;
  const derived = crypto.scryptSync(String(password), storedSalt, 64).toString('hex');
  const a = Buffer.from(derived, 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/**
 * 获取或初始化用户货币钱包
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
    hasPayPassword: Boolean(wallet.pay_password_hash),
    isLocked: Boolean(wallet.is_locked),
    updatedAt: wallet.updated_at,
  };
}

/**
 * 设置或修改支付密码（6 位数字或安全字符）
 */
export async function setPayPassword(userId, newPassword) {
  if (!newPassword || String(newPassword).length < 6) {
    throw new Error('支付密码长度至少为 6 位');
  }
  const { salt, hash } = hashPayPassword(newPassword);
  const now = nowIso();
  await execute(`
    UPDATE currency_wallets
    SET pay_password_hash = $1, pay_password_salt = $2, updated_at = $3
    WHERE user_id = $4
  `, [hash, salt, now, userId]);
  return { success: true };
}

/**
 * 验证支付密码
 */
export async function verifyPayPassword(userId, password) {
  const row = await queryOne('SELECT pay_password_hash, pay_password_salt FROM currency_wallets WHERE user_id = $1', [userId]);
  if (!row || !row.pay_password_hash) {
    throw new Error('未设置支付密码，请先前往安全中心设置');
  }
  return verifyPayPasswordHash(password, row.pay_password_hash, row.pay_password_salt);
}

/**
 * 法币充值购买 K-Coin (复式记账法入账)
 * @param {Object} params
 * @param {string} params.userId
 * @param {number} params.amountCny - 充值法币金额 (元)
 * @param {string} params.channel - 'alipay', 'wechat', 'stripe'
 * @param {string} params.providerOrderId - 第三方交易号
 * @param {string} params.idempotencyKey - 幂等请求键
 */
export async function rechargeCurrency({ userId, amountCny, channel, providerOrderId, idempotencyKey }) {
  if (!amountCny || amountCny <= 0) throw new Error('充值金额必须大于 0');
  const coinAmount = Number((amountCny * CURRENCY.CNY_TO_COIN_RATE).toFixed(4));
  const txId = `tx_rec_${randomId()}`;
  const now = nowIso();

  return await withTransaction(async (tx) => {
    // 1. 幂等校验
    if (idempotencyKey) {
      const existing = await tx.queryOne(
        'SELECT * FROM currency_journal_entries WHERE idempotency_key = $1',
        [idempotencyKey]
      );
      if (existing) {
        return { success: true, message: '幂等已处理', coinAmount, transactionId: existing.transaction_id };
      }
    }

    // 2. 锁定钱包
    let wallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [userId]);
    if (!wallet) {
      await tx.execute(`
        INSERT INTO currency_wallets
        (user_id, available_balance, frozen_balance, restricted_balance, is_locked, version, updated_at, created_at)
        VALUES ($1, 0.0000, 0.0000, 0.0000, FALSE, 1, $2, $3)
        ON CONFLICT (user_id) DO NOTHING
      `, [userId, now, now]);
      wallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [userId]);
    }

    if (wallet.is_locked) {
      throw new Error('钱包已被风控锁定，无法入账，请联系客服');
    }

    const newAvailable = Number((Number(wallet.available_balance || 0) + coinAmount).toFixed(4));

    // 3. 复式记账分录 (Debit 通道存款资产 1001, Credit 用户代币负债 2001)
    const entryIdAsset = `cje_${randomId()}`;
    const entryIdLiability = `cje_${randomId()}`;

    // 借：银行/第三方渠道资产增加
    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
      VALUES ($1, $2, $3, $4, 'DEBIT', $5, $6, 'RECHARGE', $7, $8, $9, $10)
    `, [entryIdAsset, txId, userId, ACCOUNT_CODES.ASSET_GATEWAY_DEPOSIT, coinAmount, null, providerOrderId || txId, idempotencyKey ? `${idempotencyKey}_asset` : null, `通道 ${channel} 收到充值法币 ¥${amountCny}`, now]);

    // 贷：用户可用货币负债增加
    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, idempotency_key, description, created_at)
      VALUES ($1, $2, $3, $4, 'CREDIT', $5, $6, 'RECHARGE', $7, $8, $9, $10)
    `, [entryIdLiability, txId, userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, coinAmount, newAvailable, providerOrderId || txId, idempotencyKey, `购买 ${coinAmount} K-Coin 到账`, now]);

    // 4. 更新钱包物化余额
    await tx.execute(`
      UPDATE currency_wallets
      SET available_balance = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [newAvailable, now, userId]);

    return {
      success: true,
      transactionId: txId,
      coinAmount,
      balanceAfter: newAvailable,
    };
  });
}

/**
 * 平台通用货币转账 / 好友赠送 / 打赏 (具有严密风控、限额、支付密码与复式分录)
 */
export async function transferCurrency({
  senderId,
  receiverId,
  amount,
  payPassword,
  clientIp = '127.0.0.1',
  userAgent = 'web',
  idempotencyKey = null,
}) {
  if (senderId === receiverId) {
    throw new Error('不能转账给自己');
  }

  const numAmount = Number(Number(amount).toFixed(4));
  if (isNaN(numAmount) || numAmount < RISK_RULES.MIN_TRANSFER_AMOUNT) {
    throw new Error(`单笔转账金额不能低于 ${RISK_RULES.MIN_TRANSFER_AMOUNT} K币`);
  }

  if (numAmount > RISK_RULES.MAX_SINGLE_TRANSFER) {
    throw new Error(`单笔转账超过上限（最大 ${RISK_RULES.MAX_SINGLE_TRANSFER} K币）`);
  }

  // 1. 验证转账方支付密码
  const pwdValid = await verifyPayPassword(senderId, payPassword);
  if (!pwdValid) {
    throw new Error('支付密码错误，请核对后重试');
  }

  // 2. 检查收款方账户状态
  const receiverUser = await queryOne('SELECT id, status, display_name FROM users WHERE id = $1', [receiverId]);
  if (!receiverUser) {
    throw new Error('收款人不存在');
  }
  if (receiverUser.status === 'suspended') {
    throw new Error('收款方账户状态异常，无法接收转账');
  }

  // 3. 计算手续费 (默认 1%，最低 0.1 币)
  const fee = Number(Math.max(RISK_RULES.MIN_TRANSFER_FEE, numAmount * RISK_RULES.TRANSFER_FEE_RATE).toFixed(4));
  const totalDeduction = Number((numAmount + fee).toFixed(4));
  const txId = `tx_tf_${randomId()}`;
  const now = nowIso();

  return await withTransaction(async (tx) => {
    // 幂等防重
    if (idempotencyKey) {
      const existing = await tx.queryOne(
        'SELECT * FROM currency_transfers WHERE id = $1 OR (client_ip = $2 AND created_at > $3)',
        [idempotencyKey, clientIp, new Date(Date.now() - RISK_RULES.TRANSFER_INTERVAL_SECONDS * 1000).toISOString()]
      );
      if (existing) {
        throw new Error('转账请求处理中或操作过于频繁，请稍候');
      }
    }

    // 检查转出方日累计限额
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dailySumRow = await tx.queryOne(`
      SELECT SUM(amount) as sum_amount
      FROM currency_transfers
      WHERE sender_id = $1 AND status = 'SUCCESS' AND created_at >= $2
    `, [senderId, todayStart.toISOString()]);
    const dailyTotal = Number(dailySumRow?.sum_amount || 0);

    if (dailyTotal + numAmount > RISK_RULES.MAX_DAILY_TRANSFER) {
      throw new Error(`今日转账已达限额（每日上限 ${RISK_RULES.MAX_DAILY_TRANSFER} K币，今日已转 ${dailyTotal.toFixed(2)} K币）`);
    }

    // 锁定转出方钱包
    const senderWallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [senderId]);
    if (!senderWallet || senderWallet.is_locked) {
      throw new Error('付款方钱包不可用或已被风控冻结');
    }

    const senderAvail = Number(senderWallet.available_balance || 0);
    if (senderAvail < totalDeduction) {
      throw new Error(`可用余额不足。本次转账需要 ${numAmount} K币 + ${fee} K币手续费，共需 ${totalDeduction} K币，当前可用 ${senderAvail.toFixed(2)} K币`);
    }

    // 锁定收款方钱包
    let receiverWallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [receiverId]);
    if (!receiverWallet) {
      await tx.execute(`
        INSERT INTO currency_wallets
        (user_id, available_balance, frozen_balance, restricted_balance, is_locked, version, updated_at, created_at)
        VALUES ($1, 0.0000, 0.0000, 0.0000, FALSE, 1, $2, $3)
        ON CONFLICT (user_id) DO NOTHING
      `, [receiverId, now, now]);
      receiverWallet = await tx.queryOne('SELECT * FROM currency_wallets WHERE user_id = $1', [receiverId]);
    }

    if (receiverWallet.is_locked) {
      throw new Error('收款方钱包已被锁定，无法完成转账');
    }

    // 更新双方余额
    const senderNewBalance = Number((senderAvail - totalDeduction).toFixed(4));
    const receiverNewBalance = Number((Number(receiverWallet.available_balance || 0) + numAmount).toFixed(4));

    await tx.execute(`
      UPDATE currency_wallets
      SET available_balance = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [senderNewBalance, now, senderId]);

    await tx.execute(`
      UPDATE currency_wallets
      SET available_balance = $1, version = version + 1, updated_at = $2
      WHERE user_id = $3
    `, [receiverNewBalance, now, receiverId]);

    // 记录转账主记录
    const transferId = idempotencyKey || `trf_${randomId()}`;
    await tx.execute(`
      INSERT INTO currency_transfers
      (id, sender_id, receiver_id, amount, fee, status, risk_score, risk_remarks, client_ip, user_agent, created_at)
      VALUES ($1, $2, $3, $4, $5, 'SUCCESS', 0, '正常用户互转', $6, $7, $8)
    `, [transferId, senderId, receiverId, numAmount, fee, clientIp, userAgent, now]);

    // 记录复式分录：
    // 1) 付款方代币负债减少 (借 2001)
    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at)
      VALUES ($1, $2, $3, $4, 'DEBIT', $5, $6, 'TRANSFER_OUT', $7, $8, $9)
    `, [`cje_${randomId()}`, txId, senderId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, numAmount, senderNewBalance, transferId, `向用户 ${receiverUser.display_name || receiverId} 转出`, now]);

    // 2) 付款方手续费 (借 2001, 贷 4001 平台服务收入)
    if (fee > 0) {
      await tx.execute(`
        INSERT INTO currency_journal_entries
        (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at)
        VALUES ($1, $2, $3, $4, 'DEBIT', $5, $6, 'TRANSFER_FEE', $7, $8, $9)
      `, [`cje_${randomId()}`, txId, senderId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, fee, senderNewBalance, transferId, `转账服务费 (1%)`, now]);

      await tx.execute(`
        INSERT INTO currency_journal_entries
        (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at)
        VALUES ($1, $2, null, $3, 'CREDIT', $4, null, 'TRANSFER_FEE', $5, $6, $7)
      `, [`cje_${randomId()}`, txId, ACCOUNT_CODES.REVENUE_SERVICE_FEE, fee, transferId, `转账手续费收益 (转账ID: ${transferId})`, now]);
    }

    // 3) 收款方代币负债增加 (贷 2001)
    await tx.execute(`
      INSERT INTO currency_journal_entries
      (id, transaction_id, user_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at)
      VALUES ($1, $2, $3, $4, 'CREDIT', $5, $6, 'TRANSFER_IN', $7, $8, $9)
    `, [`cje_${randomId()}`, txId, receiverId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, numAmount, receiverNewBalance, transferId, `收到转账`, now]);

    return {
      success: true,
      transferId,
      transactionId: txId,
      amount: numAmount,
      fee,
      senderBalanceAfter: senderNewBalance,
      receiverDisplayName: receiverUser.display_name,
    };
  });
}

/**
 * 查询用户货币变动流水账单
 */
export async function getCurrencyLedger(userId, { limit = 20, offset = 0 } = {}) {
  const rows = await query(`
    SELECT id, transaction_id, account_code, direction, amount, balance_after, biz_type, biz_id, description, created_at
    FROM currency_journal_entries
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2 OFFSET $3
  `, [userId, limit, offset]);

  return rows.rows.map(r => ({
    id: r.id,
    transactionId: r.transaction_id,
    direction: r.direction,
    amount: Number(r.amount),
    balanceAfter: r.balance_after ? Number(r.balance_after) : null,
    bizType: r.biz_type,
    description: r.description,
    createdAt: r.created_at,
  }));
}
