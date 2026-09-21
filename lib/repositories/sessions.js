import 'server-only';

import { execute, queryMany } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function listActiveSessions(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['s.expires_at > NOW()', 's.revoked_at IS NULL'];
  const sqlParams = [];
  let index = 0;
  const next = () => `$${++index}`;
  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(u.email ILIKE ${next()} OR s.user_id ILIKE ${next()})`);
    sqlParams.push(`%${q}%`, `%${q}%`);
  }
  const baseSql = `
    SELECT s.token_hash, s.token_hash AS id, s.user_id, s.expires_at, s.last_seen_at, s.created_at, u.email, u.role
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE ${clauses.join(' AND ')}
  `;
  return pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
    tableAlias: 's',
    idColumn: 'token_hash',
  });
}

export async function listUserSessions(userId) {
  return queryMany(`
    SELECT token_hash, expires_at, last_seen_at, created_at
    FROM sessions
    WHERE user_id = $1 AND expires_at > NOW() AND revoked_at IS NULL
    ORDER BY created_at DESC
  `, [userId]);
}

export async function revokeAllUserSessions(userId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  return run('DELETE FROM sessions WHERE user_id = $1', [userId]);
}

export async function revokeSessionByHash(tokenHash) {
  return execute('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}
