import 'server-only';

import { execute, nowIso, queryMany, queryOne, randomId } from '../db/index.js';

export const EMAIL_PURPOSES = ['verification', 'test', 'system', 'marketing'];
export const EMAIL_STATUSES = ['success', 'failed'];

const PREVIEW_LIMIT = 240;

// 验证码明文绝不能进明细表：命中「验证码为 123456」这类句式就整段替换。
export function redactSecrets(text) {
  return String(text || '')
    .replace(/(验证码[为:：\s]*)(\d{6})/g, '$1******')
    .replace(/\b\d{6}\b/g, '******')
    .slice(0, PREVIEW_LIMIT);
}

export function recipientDomain(value) {
  return String(value || '').split('@')[1]?.toLowerCase() || '';
}

export async function recordEmailSendLog({
  purpose = 'system',
  recipient,
  subject,
  body = '',
  status,
  errorCode = null,
  latencyMs = null,
  provider = 'email_smtp',
  userId = null,
  actorId = null,
}) {
  const address = String(recipient || '').trim().toLowerCase();
  if (!address) return null;
  const id = randomId('esml');
  await execute(`
    INSERT INTO auth_usr.email_send_logs (
      id, provider, purpose, recipient, recipient_domain, subject, body_preview,
      status, error_code, latency_ms, user_id, actor_id, created_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
  `, [
    id,
    provider,
    EMAIL_PURPOSES.includes(purpose) ? purpose : 'system',
    address.slice(0, 254),
    recipientDomain(address).slice(0, 254),
    String(subject || '（无主题）').slice(0, 500),
    redactSecrets(body),
    EMAIL_STATUSES.includes(status) ? status : 'failed',
    errorCode ? String(errorCode).slice(0, 64) : null,
    Number.isFinite(latencyMs) ? Math.max(0, Math.round(latencyMs)) : null,
    userId,
    actorId,
    nowIso(),
  ]);
  return id;
}

export async function listEmailSendLogs({ searchParams }) {
  const { pagedQuery } = await import('../admin/pagination.js');
  const params = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || {});
  const where = [];
  const values = [];

  const purpose = params.get('purpose');
  if (EMAIL_PURPOSES.includes(purpose)) {
    values.push(purpose);
    where.push(`purpose = $${values.length}`);
  }
  const status = params.get('status');
  if (EMAIL_STATUSES.includes(status)) {
    values.push(status);
    where.push(`status = $${values.length}`);
  }
  const domain = params.get('domain');
  if (domain) {
    values.push(`@${String(domain).replace(/^@/, '').toLowerCase()}`);
    where.push(`recipient ILIKE '%' || $${values.length}`);
  }
  const keyword = String(params.get('q') || '').trim();
  if (keyword) {
    values.push(`%${keyword}%`);
    where.push(`(recipient ILIKE $${values.length} OR subject ILIKE $${values.length})`);
  }
  const days = Number(params.get('days') || 0);
  if ([1, 7, 30].includes(days)) {
    values.push(new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
    where.push(`created_at >= $${values.length}`);
  }

  const baseSql = `
    SELECT id, purpose, recipient, recipient_domain, subject, body_preview,
           status, error_code, latency_ms, user_id, actor_id, created_at
    FROM auth_usr.email_send_logs
    ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
  `;
  return pagedQuery({ baseSql, params: values, searchParams: params, defaultLimit: 20 });
}

export async function getEmailSendStats() {
  const [summary, byPurpose, trend, topDomains] = await Promise.all([
    queryOne(`
      SELECT
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int AS today_total,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()) AND status = 'success')::int AS today_success,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS week_total,
        COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days' AND status = 'failed')::int AS week_failed,
        COUNT(*)::int AS all_total,
        COUNT(*) FILTER (WHERE status = 'success')::int AS all_success,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS all_failed,
        ROUND(AVG(latency_ms) FILTER (WHERE created_at >= now() - interval '7 days'))::int AS week_avg_latency_ms
      FROM auth_usr.email_send_logs
    `),
    queryMany(`
      SELECT purpose,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'success')::int AS success,
             COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM auth_usr.email_send_logs
      WHERE created_at >= now() - interval '7 days'
      GROUP BY purpose ORDER BY total DESC
    `),
    queryMany(`
      SELECT to_char(date_trunc('day', created_at), 'MM-DD') AS day,
             COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM auth_usr.email_send_logs
      WHERE created_at >= now() - interval '7 days'
      GROUP BY date_trunc('day', created_at) ORDER BY date_trunc('day', created_at)
    `),
    queryMany(`
      SELECT recipient_domain AS domain, COUNT(*)::int AS total
      FROM auth_usr.email_send_logs
      WHERE created_at >= now() - interval '30 days' AND recipient_domain <> ''
      GROUP BY recipient_domain ORDER BY total DESC LIMIT 6
    `),
  ]);

  return { summary: summary || {}, byPurpose, trend, topDomains };
}
