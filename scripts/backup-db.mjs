import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);

export async function createPostgresBackup() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for PostgreSQL backup.');
  const backupDir = path.join(process.cwd(), 'data', 'backups');
  await fs.mkdir(backupDir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(backupDir, 'postgres-' + timestamp + '.dump');
  await execFileAsync('pg_dump', ['--format=custom', '--no-owner', '--file', target, process.env.DATABASE_URL], { env: { ...process.env }, windowsHide: true });
  const stat = await fs.stat(target);
  return { target, bytes: stat.size };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isMain) {
  try {
    const result = await createPostgresBackup();
    console.log('[backup] PostgreSQL backup created: ' + result.target + ' (' + (result.bytes / 1024 / 1024).toFixed(2) + ' MB)');
  } catch (error) {
    console.error('[backup] PostgreSQL backup failed:', error.message);
    process.exitCode = 1;
  }
}
