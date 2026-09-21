import crypto from 'node:crypto';
import { logAudit } from '../admin/audit.js';
import * as exportRepo from '../repositories/exports.js';
import {
  EXPORT_JOB_TTL_MS,
  claimExportJob,
  completeExportJob,
  createExportJob,
  expireExportJob,
  failExportJob,
  getExportContent,
  getExportJob,
  listQueuedExportJobs,
  purgeExpiredExportJobs,
} from '../repositories/exportJobs.js';

export const EXPORT_DEFINITIONS = Object.freeze({
  users: {
    label: '用户',
    headers: ['id', 'email_masked', 'display_name', 'role', 'status', 'created_at', 'last_login_at'],
    filePrefix: 'users',
  },
  orders: {
    label: '订单',
    headers: ['id', 'email_masked', 'provider', 'plan_id', 'status', 'amount', 'currency', 'created_at', 'paid_at', 'refunded_at'],
    filePrefix: 'orders',
  },
  creations: {
    label: '生成记录',
    headers: ['id', 'email_masked', 'provider', 'model', 'studio_id', 'status', 'credit_cost', 'duration_ms', 'created_at', 'completed_at'],
    filePrefix: 'creations',
  },
});

export function getExportDefinition(type) {
  return EXPORT_DEFINITIONS[String(type || '').trim()] || null;
}

export function maskEmail(email) {
  const value = String(email || '').trim();
  const at = value.indexOf('@');
  if (at <= 0) return value ? '***' : '';
  const name = value.slice(0, at);
  const domain = value.slice(at + 1);
  return `${name.length <= 2 ? `${name.slice(0, 1)}*` : `${name.slice(0, 2)}***`}@${domain}`;
}

export function escapeCsvField(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value).replace(/"/g, '""');
  return /[,\n"]/.test(stringValue) ? `"${stringValue}"` : stringValue;
}

export function toCsvString(headers, rows) {
  return `\uFEFF${headers.map(escapeCsvField).join(',')}\n${rows.map((row) => headers.map((header) => escapeCsvField(row[header])).join(',')).join('\n')}`;
}

function normalizeFilters(filters = {}) {
  const input = filters && typeof filters === 'object' ? filters : {};
  return {
    q: String(input.q || '').trim().slice(0, 100),
    from: /^\d{4}-\d{2}-\d{2}$/.test(String(input.from || '')) ? String(input.from) : '',
    to: /^\d{4}-\d{2}-\d{2}$/.test(String(input.to || '')) ? String(input.to) : '',
  };
}

export function normalizeExportRows(type, rows) {
  return rows.map((row) => ({
    ...row,
    email_masked: maskEmail(row.email),
  }));
}

async function loadRows(type, filters) {
  if (type === 'users') return exportRepo.exportUsers(filters);
  if (type === 'orders') return exportRepo.exportOrders(filters);
  if (type === 'creations') return exportRepo.exportCreations(filters);
  throw new Error('Unsupported export type');
}

export async function requestExport({ actor, type, filters = {}, requestId }) {
  const definition = getExportDefinition(type);
  if (!definition) return { error: '不支持的导出数据类型' };
  await purgeExpiredExportJobs();
  const normalizedFilters = normalizeFilters(filters);
  const expiresAt = new Date(Date.now() + EXPORT_JOB_TTL_MS).toISOString();
  const job = await createExportJob({ requestedBy: actor.id, exportType: type, filters: normalizedFilters, expiresAt });
  await logAudit({
    actor,
    action: 'exports.requested',
    targetType: 'export_job',
    targetId: job.id,
    riskLevel: 'medium',
    after: { type, filters: normalizedFilters, expiresAt },
    requestId,
  });
  return { success: true, job };
}

export async function processExportJob(jobId, { actor = null, requestId = null } = {}) {
  const job = await claimExportJob(jobId);
  if (!job) return getExportJob(jobId);
  const definition = getExportDefinition(job.export_type);
  try {
    const rows = await loadRows(job.export_type, job.filters_json || {});
    const csvRows = normalizeExportRows(job.export_type, rows);
    const content = toCsvString(definition.headers, csvRows);
    const contentSha256 = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
    const completed = await completeExportJob(job.id, {
      fileName: `export_${definition.filePrefix}_${Date.now()}.csv`,
      content,
      contentSha256,
    });
    await logAudit({
      actor: actor || { id: 'system', email: 'system@koyosim.local' },
      action: 'exports.completed',
      targetType: 'export_job',
      targetId: job.id,
      riskLevel: 'low',
      after: { type: job.export_type, rowCount: rows.length, contentSha256 },
      requestId,
    });
    return completed || getExportJob(job.id);
  } catch (error) {
    await failExportJob(job.id, { errorCode: error?.code || 'EXPORT_FAILED' });
    await logAudit({
      actor: actor || { id: 'system', email: 'system@koyosim.local' },
      action: 'exports.failed',
      targetType: 'export_job',
      targetId: job.id,
      riskLevel: 'medium',
      after: { type: job.export_type, errorCode: error?.code || 'EXPORT_FAILED' },
      requestId,
    });
    return getExportJob(job.id);
  }
}

export async function getExportStatus(jobId) {
  await expireExportJob(jobId);
  return getExportJob(jobId);
}

export async function runExportWorkerOnce({ batchSize = 10 } = {}) {
  const queued = await listQueuedExportJobs(batchSize);
  const processed = [];
  for (const row of queued) {
    try {
      processed.push({ id: row.id, result: await processExportJob(row.id, { requestId: `export-worker:${row.id}` }) });
    } catch (error) {
      processed.push({ id: row.id, error: error.code || 'EXPORT_WORKER_FAILED' });
    }
  }
  const purged = await purgeExpiredExportJobs();
  return { queuedCount: queued.length, processed, purged };
}

export async function getDownloadableExport(jobId) {
  await expireExportJob(jobId);
  return getExportContent(jobId);
}

export function getExportNow() {
  return new Date().toISOString();
}
