import 'server-only';

import { execute, nowIso, queryMany, randomId } from '../db/index.js';
import { pagedQuery, toSearchParams } from './pagination.js';
import { redact } from './redaction.js';

export async function logAudit({ actor, action, targetType = null, targetId = null, riskLevel = 'low', before = null, after = null, requestId = null, transaction = null }) {
  const id = randomId('audit');
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await run(`
    INSERT INTO admin_audit_logs
      (id, actor_id, actor_email, action, target_type, target_id, risk_level, before_json, after_json, request_id, created_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb, $10, $11)
  `, [id, actor?.id || 'system', actor?.email || 'system@koyosim.local', action,
    targetType, targetId ? String(targetId).slice(0, 120) : null, riskLevel,
    before ? JSON.stringify(redact(before)) : null, after ? JSON.stringify(redact(after)) : null, requestId, nowIso()]);
  return id;
}

export async function queryAuditLogs(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const values = [];
  let index = 0;
  const next = () => `$${++index}`;
  const q = String(params.get('q') || '').trim();
  if (q) { clauses.push(`(actor_email ILIKE ${next()} OR action ILIKE ${next()} OR target_id ILIKE ${next()})`); values.push(`%${q}%`, `%${q}%`, `%${q}%`); }
  const risk = String(params.get('risk') || '').trim();
  if (['low', 'medium', 'high'].includes(risk)) { clauses.push(`risk_level = ${next()}`); values.push(risk); }
  const targetType = String(params.get('target_type') || '').trim();
  if (targetType) { clauses.push(`target_type = ${next()}`); values.push(targetType); }
  const result = await pagedQuery({
    baseSql: `SELECT id, actor_id, actor_email, action, target_type, target_id, risk_level, before_json, after_json, request_id, created_at FROM admin_audit_logs WHERE ${clauses.join(' AND ')}`,
    params: values, searchParams: params, tableAlias: '', order: 'created_at DESC, id DESC',
  });
  return {
    rows: result.rows.map((row) => ({
      ...row,
      before: typeof row.before_json === 'string' ? JSON.parse(row.before_json) : (row.before_json || null),
      after: typeof row.after_json === 'string' ? JSON.parse(row.after_json) : (row.after_json || null),
    })),
    meta: result.meta,
  };
}
