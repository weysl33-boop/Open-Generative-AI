import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const DEFAULT_DB_PATH = path.join(process.cwd(), 'data', 'billing.db');
const dbPath = process.env.BILLING_DB_PATH || DEFAULT_DB_PATH;

if (!fs.existsSync(dbPath)) {
  console.error(`[backup] 数据库文件不存在: ${dbPath}`);
  process.exit(1);
}

const backupDir = path.join(path.dirname(dbPath), 'backups');
fs.mkdirSync(backupDir, { recursive: true });

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const targetBackupPath = path.join(backupDir, `billing-${timestamp}.db`);

console.log(`[backup] 正在执行数据库一致性备份...`);
console.log(`源路径: ${dbPath}`);
console.log(`目标路径: ${targetBackupPath}`);

try {
  const db = new DatabaseSync(dbPath);
  // 使用 VACUUM INTO 进行无损一致性在线快照
  db.exec(`VACUUM INTO '${targetBackupPath.replace(/\\/g, '/')}'`);
  const bytes = fs.statSync(targetBackupPath).size;
  console.log(`[backup] 备份成功！文件大小: ${(bytes / 1024 / 1024).toFixed(2)} MB`);
} catch (error) {
  console.error(`[backup] 备份失败:`, error.message);
  process.exit(1);
}
