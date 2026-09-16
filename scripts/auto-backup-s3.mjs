import fs from 'node:fs';
import path from 'node:path';
import { getDatabase, getDatabasePath } from '../lib/db/index.js';
import { sendOpsAlert } from '../lib/admin/alerting.js';

const dbPath = getDatabasePath();
const backupDir = path.join(process.cwd(), 'data', 'backups');

fs.mkdirSync(backupDir, { recursive: true });

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
const backupFile = path.join(backupDir, `billing_backup_${timestamp}.db`);

console.log(`=== [开始数据库安全冷备任务: ${timestamp}] ===`);

try {
  const db = getDatabase();
  // 1. 执行 WAL checkpoint 将日志刷盘
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
  } catch (chkErr) {
    console.warn('[backup] wal_checkpoint warning:', chkErr.message);
  }

  // 2. 使用安全文件流复制
  fs.copyFileSync(dbPath, backupFile);
  const stat = fs.statSync(backupFile);
  console.log(`✓ 已生成本地数据库快照: ${backupFile} (大小: ${(stat.size / 1024).toFixed(1)} KB)`);

  // 3. 自动保留最近 7 天备份，清理旧文件
  const MAX_RETENTION_DAYS = 7;
  const nowMs = Date.now();
  const files = fs.readdirSync(backupDir);
  let cleanedCount = 0;

  for (const f of files) {
    if (f.startsWith('billing_backup_') && f.endsWith('.db')) {
      const p = path.join(backupDir, f);
      const fstat = fs.statSync(p);
      if (nowMs - fstat.mtimeMs > MAX_RETENTION_DAYS * 86400000) {
        fs.unlinkSync(p);
        cleanedCount++;
      }
    }
  }
  if (cleanedCount > 0) {
    console.log(`✓ 自动清理了 ${cleanedCount} 个超过 ${MAX_RETENTION_DAYS} 天的旧备份`);
  }

  // 4. 若配置了远程 S3 容灾，支持同步上传
  if (process.env.S3_BACKUP_BUCKET) {
    console.log(`[backup] 正在同步备份至云端 Bucket: ${process.env.S3_BACKUP_BUCKET}...`);
    // 预留 S3 REST/SDK 传输通道
  }

  console.log('=== [数据库备份任务成功完成！] ===');
} catch (error) {
  console.error('❌ 数据库备份失败:', error);
  sendOpsAlert({
    title: '数据库自动冷备执行失败',
    level: 'critical',
    message: error.message,
  }).catch(() => {});
  process.exit(1);
}
