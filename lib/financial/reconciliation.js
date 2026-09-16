import 'server-only';

import { query, queryOne, nowIso } from '../db/index.js';
import { ACCOUNT_CODES } from './constants.js';

/**
 * 运行金融级平账与对账巡检
 */
export async function runDailyReconciliation() {
  const startTime = Date.now();
  const report = {
    reconciledAt: nowIso(),
    status: 'HEALTHY',
    discrepancies: [],
    currencyTotals: {},
    creditsTotals: {},
  };

  // 1. 全局复式记账借贷平衡校验 (SUM(DEBIT) vs SUM(CREDIT))
  const debitRes = await queryOne(`
    SELECT COALESCE(SUM(amount), 0) as total_debit 
    FROM currency_journal_entries 
    WHERE direction = 'DEBIT'
  `);
  const creditRes = await queryOne(`
    SELECT COALESCE(SUM(amount), 0) as total_credit 
    FROM currency_journal_entries 
    WHERE direction = 'CREDIT'
  `);

  const totalDebit = Number(Number(debitRes?.total_debit || 0).toFixed(4));
  const totalCredit = Number(Number(creditRes?.total_credit || 0).toFixed(4));
  const bookDifference = Number((totalDebit - totalCredit).toFixed(4));

  report.currencyTotals = {
    totalDebit,
    totalCredit,
    difference: bookDifference,
    isDoubleEntryBalanced: Math.abs(bookDifference) < 0.0001,
  };

  if (!report.currencyTotals.isDoubleEntryBalanced) {
    report.status = 'DISCREPANCY_DETECTED';
    report.discrepancies.push({
      type: 'GLOBAL_DOUBLE_ENTRY_IMBALANCE',
      message: `全局复式分录借贷不平！借方总计: ${totalDebit}，贷方总计: ${totalCredit}，差额: ${bookDifference}`,
    });
  }

  // 2. 用户货币钱包物化余额对账
  const wallets = await query(`
    SELECT user_id, available_balance, restricted_balance, is_locked 
    FROM currency_wallets
  `);

  for (const w of wallets.rows) {
    const userLedger = await queryOne(`
      SELECT 
        COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0) as total_in,
        COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0) as total_out
      FROM currency_journal_entries
      WHERE user_id = $1 AND account_code IN ($2, $3)
    `, [w.user_id, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, ACCOUNT_CODES.LIABILITY_USER_RESTRICTED]);

    const calculatedBalance = Number((Number(userLedger?.total_in || 0) - Number(userLedger?.total_out || 0)).toFixed(4));
    const recordedBalance = Number(Number(w.available_balance || 0).toFixed(4));

    if (Math.abs(calculatedBalance - recordedBalance) > 0.0001) {
      report.status = 'DISCREPANCY_DETECTED';
      report.discrepancies.push({
        type: 'USER_CURRENCY_BALANCE_MISMATCH',
        userId: w.user_id,
        recordedBalance,
        calculatedBalance,
        diff: Number((recordedBalance - calculatedBalance).toFixed(4)),
      });
    }
  }

  // 3. 算力积分永久池流水对账
  const creditWallets = await query(`
    SELECT user_id, perpetual_credits FROM credit_wallets
  `);

  for (const cw of creditWallets.rows) {
    const ledgerSum = await queryOne(`
      SELECT COALESCE(SUM(delta), 0) as total_delta 
      FROM credit_ledger_v2
      WHERE user_id = $1 AND bucket_type = 'PERPETUAL'
    `, [cw.user_id]);

    const calculatedCredits = Number(ledgerSum?.total_delta || 0);
    const recordedCredits = Number(cw.perpetual_credits || 0);

    // 考虑老系统数据平移基数（如果差异存在）
    if (calculatedCredits !== recordedCredits && calculatedCredits !== 0) {
      // 记录注意项，供管理人员核查
      report.discrepancies.push({
        type: 'USER_CREDIT_PERPETUAL_MISMATCH',
        userId: cw.user_id,
        recordedCredits,
        calculatedCredits,
      });
    }
  }

  report.durationMs = Date.now() - startTime;
  return report;
}
