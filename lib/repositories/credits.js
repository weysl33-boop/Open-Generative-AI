import { query, queryOne } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function listCreditLedger(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let parameterIndex = 0;
  const nextParameter = () => `$${++parameterIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.email ILIKE ${nextParameter()} OR l.user_id ILIKE ${nextParameter()} OR l.reason ILIKE ${nextParameter()} OR l.reference_id ILIKE ${nextParameter()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const userId = String(params.get('user_id') || '').trim();
  if (userId) {
    clauses.push(`l.user_id = ${nextParameter()}`);
    sqlParams.push(userId);
  }

  const baseSql = `
    SELECT l.id, l.user_id, l.delta, l.description AS reason, l.reference_id, l.actor_user_id,
           l.bucket_type, l.action_type, l.balance_after, l.created_at, u.email
    FROM credit_ledger_v2 l
    JOIN users u ON u.id = l.user_id
    WHERE ${clauses.join(' AND ')}
  `;

  return await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 'l',
  });
}

export async function listUserCreditLedger(userId, limit = 20) {
  const res = await query(`
    SELECT id, delta, description AS reason, reference_id, actor_user_id,
           bucket_type, action_type, balance_after, created_at
    FROM credit_ledger_v2
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit]);
  return res.rows;
}

export async function getLockedCreditWallet(userId, transaction) {
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  return run('SELECT daily_free_credits, subscription_credits, perpetual_credits FROM credit_wallets WHERE user_id = $1 FOR UPDATE', [userId]);
}
