import { query, execute, nowIso, randomId } from '../db/index.js';
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
    SELECT l.id, l.user_id, l.delta, l.reason, l.reference_id, l.actor_user_id, l.created_at, u.email
    FROM credit_ledger l
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
    SELECT id, delta, reason, reference_id, actor_user_id, created_at
    FROM credit_ledger
    WHERE user_id = $1
    ORDER BY created_at DESC
    LIMIT $2
  `, [userId, limit]);
  return res.rows;
}

export async function insertCreditEntry(dbOrNull, { userId, delta, reason, referenceId = null, actorUserId = null, metadata = {} }) {
  const id = randomId('ledger');
  const now = nowIso();
  const executor = dbOrNull && typeof dbOrNull.execute === 'function' ? dbOrNull.execute.bind(dbOrNull) : execute;

  await executor(`
    INSERT INTO credit_ledger
      (id, user_id, delta, reason, reference_id, actor_user_id, metadata_json, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
  `, [id, userId, delta, reason, referenceId, actorUserId, JSON.stringify(metadata), now]);

  return id;
}
