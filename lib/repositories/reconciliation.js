import { query, queryOne } from '../db/index.js';
import { ACCOUNT_CODES } from '../financial/constants.js';

export async function getDoubleEntryTotals() {
  const [debit, credit] = await Promise.all([
    queryOne(`
      SELECT COALESCE(SUM(amount), 0) AS total_debit
      FROM currency_journal_entries
      WHERE direction = 'DEBIT'
    `),
    queryOne(`
      SELECT COALESCE(SUM(amount), 0) AS total_credit
      FROM currency_journal_entries
      WHERE direction = 'CREDIT'
    `),
  ]);
  return {
    totalDebit: Number(debit?.total_debit || 0),
    totalCredit: Number(credit?.total_credit || 0),
  };
}

export async function listCurrencyWalletBalances() {
  const result = await query(`
    SELECT user_id, available_balance, restricted_balance, is_locked
    FROM currency_wallets
  `);
  return result.rows;
}

export async function getUserCurrencyLedgerTotals(userId) {
  return queryOne(`
    SELECT
      COALESCE(SUM(CASE WHEN direction = 'CREDIT' THEN amount ELSE 0 END), 0) AS total_in,
      COALESCE(SUM(CASE WHEN direction = 'DEBIT' THEN amount ELSE 0 END), 0) AS total_out
    FROM currency_journal_entries
    WHERE user_id = $1 AND account_code IN ($2, $3)
  `, [userId, ACCOUNT_CODES.LIABILITY_USER_AVAILABLE, ACCOUNT_CODES.LIABILITY_USER_RESTRICTED]);
}

export async function listCreditWalletBalances() {
  const result = await query(`
    SELECT user_id, perpetual_credits
    FROM credit_wallets
  `);
  return result.rows;
}

export async function getUserPerpetualCreditLedgerTotal(userId) {
  return queryOne(`
    SELECT COALESCE(SUM(delta), 0) AS total_delta
    FROM credit_ledger_v2
    WHERE user_id = $1 AND bucket_type = 'PERPETUAL'
  `, [userId]);
}
