import { execute, nowIso, queryOne, randomId, withTransaction } from '../db/index.js';

export const EXPORT_JOB_TTL_MS = 30 * 60 * 1000;

export async function createExportJob({ requestedBy, exportType, filters = {}, expiresAt }) {
  const id = randomId('export');
  return queryOne(`
    INSERT INTO admin_export_jobs
      (id, requested_by, export_type, filters_json, status, expires_at, created_at)
    VALUES ($1, $2, $3, $4::jsonb, 'queued', $5, $6)
    RETURNING id, requested_by, export_type, filters_json, status, expires_at, created_at
  `, [id, requestedBy, exportType, JSON.stringify(filters), expiresAt, nowIso()]);
}

export async function getExportJob(id) {
  return queryOne(`
    SELECT id, requested_by, export_type, filters_json, status, file_name,
           content_sha256, error_code, error_message, expires_at,
           created_at, started_at, completed_at
    FROM admin_export_jobs WHERE id = $1
  `, [id]);
}

export async function claimExportJob(id) {
  return queryOne(`
    UPDATE admin_export_jobs
    SET status = 'running', started_at = COALESCE(started_at, $2)
    WHERE id = $1 AND status = 'queued' AND expires_at > $2
    RETURNING id, requested_by, export_type, filters_json, status, expires_at, created_at, started_at
  `, [id, nowIso()]);
}

export async function listQueuedExportJobs(limit = 10) {
  const size = Math.min(50, Math.max(1, Number(limit) || 10));
  return queryMany(`
    SELECT id, status, expires_at
    FROM admin_export_jobs
    WHERE status = 'queued' AND expires_at > $1
    ORDER BY created_at ASC
    LIMIT $2
  `, [nowIso(), size]);
}

export async function completeExportJob(id, { fileName, content, contentSha256 }) {
  return queryOne(`
    UPDATE admin_export_jobs
    SET status = 'succeeded', file_name = $2, content_text = $3,
        content_sha256 = $4, completed_at = $5, error_code = NULL, error_message = NULL
    WHERE id = $1 AND status = 'running'
    RETURNING id, status, file_name, content_sha256, expires_at, completed_at
  `, [id, fileName, content, contentSha256, nowIso()]);
}

export async function failExportJob(id, { errorCode = 'EXPORT_FAILED', errorMessage = '导出任务失败' } = {}) {
  return queryOne(`
    UPDATE admin_export_jobs
    SET status = 'failed', error_code = $2, error_message = $3, completed_at = $4
    WHERE id = $1 AND status = 'running'
    RETURNING id, status, error_code, error_message, expires_at, completed_at
  `, [id, errorCode, errorMessage, nowIso()]);
}

export async function expireExportJob(id) {
  return queryOne(`
    UPDATE admin_export_jobs
    SET status = 'expired', content_text = NULL, error_code = 'EXPORT_EXPIRED',
        error_message = '导出文件已过期', completed_at = COALESCE(completed_at, $2)
    WHERE id = $1 AND expires_at <= $2 AND status IN ('queued', 'running', 'succeeded')
    RETURNING id, status, expires_at
  `, [id, nowIso()]);
}

export async function getExportContent(id) {
  return queryOne(`
    SELECT id, requested_by, export_type, status, file_name, content_text,
           content_sha256, expires_at
    FROM admin_export_jobs
    WHERE id = $1 AND status = 'succeeded' AND expires_at > $2
  `, [id, nowIso()]);
}

export async function purgeExpiredExportJobs() {
  return execute(`
    UPDATE admin_export_jobs
    SET status = 'expired', content_text = NULL, error_code = 'EXPORT_EXPIRED',
        error_message = '导出文件已过期', completed_at = COALESCE(completed_at, $1)
    WHERE expires_at <= $1 AND status IN ('queued', 'running', 'succeeded')
  `, [nowIso()]);
}

export async function withExportJobLock(id, callback) {
  return withTransaction(async (tx) => {
    const job = await tx.queryOne('SELECT id, status FROM admin_export_jobs WHERE id = $1 FOR UPDATE', [id]);
    if (!job) return null;
    return callback(job, tx);
  });
}
