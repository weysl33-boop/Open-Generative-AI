import fs from 'node:fs/promises';
import path from 'node:path';
import { createPostgresBackup } from './backup-db.mjs';
import { sendOpsAlert } from '../lib/admin/alerting.js';

try {
  const result = await createPostgresBackup();
  const directory = path.dirname(result.target);
  const cutoff = Date.now() - 7 * 86400000;
  for (const file of await fs.readdir(directory)) {
    if (!file.startsWith('postgres-') || !file.endsWith('.dump')) continue;
    const target = path.join(directory, file);
    if (target !== result.target && (await fs.stat(target)).mtimeMs < cutoff) await fs.unlink(target);
  }
  console.log('[backup] PostgreSQL backup ready: ' + result.target);
  if (process.env.S3_BACKUP_BUCKET) console.log('[backup] S3 upload is configured for ' + process.env.S3_BACKUP_BUCKET + '; attach the approved uploader in deployment.');
} catch (error) {
  const errorCode = error.code || 'POSTGRES_BACKUP_FAILED';
  console.error('[backup] automatic PostgreSQL backup failed:', { code: errorCode });
  await sendOpsAlert({ title: '数据库自动备份失败', level: 'critical', message: errorCode }).catch(() => {});
  process.exitCode = 1;
}
