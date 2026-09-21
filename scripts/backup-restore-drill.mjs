import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import { requireIsolatedTestDatabase } from './test-database-guard.mjs';

try {
  if (typeof process.loadEnvFile === 'function') {
    if (fsSync.existsSync('.env.local')) process.loadEnvFile('.env.local');
    else if (fsSync.existsSync('/etc/koyosim.env')) process.loadEnvFile('/etc/koyosim.env');
  }
} catch {}

const execFileAsync = promisify(execFile);
const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();
requireIsolatedTestDatabase(testUrl, process.env.DATABASE_URL, 'TEST_DATABASE_URL');

const source = new URL(testUrl);
const admin = new URL(testUrl);
admin.pathname = '/postgres';
const restoreDb = `p7_restore_${crypto.randomBytes(5).toString('hex')}`;
const backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'open-generative-ai-p7-'));
const dumpFile = path.join(backupDir, 'postgres.dump');
let marker;

async function createRestoreDatabase() {
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try { await client.query(`CREATE DATABASE "${restoreDb}"`); } finally { await client.end(); }
}
async function dropRestoreDatabase() {
  const client = new pg.Client({ connectionString: admin.toString() });
  await client.connect();
  try { await client.query(`DROP DATABASE IF EXISTS "${restoreDb}" WITH (FORCE)`); } finally { await client.end(); }
}
async function cleanupSourceMarker() {
  const client = new pg.Client({ connectionString: testUrl });
  await client.connect();
  try {
    await client.query('DROP TABLE IF EXISTS sys_core.p7_backup_drill');
  } finally {
    await client.end();
  }
}
try {
  const sourceClient = new pg.Client({ connectionString: testUrl });
  try {
    await sourceClient.connect();
    await sourceClient.query('CREATE TABLE IF NOT EXISTS sys_core.p7_backup_drill (id TEXT PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now())');
    marker = crypto.randomUUID();
    await sourceClient.query('INSERT INTO sys_core.p7_backup_drill (id) VALUES ($1)', [marker]);
  } finally {
    await sourceClient.end().catch(() => {});
  }
  await execFileAsync('pg_dump', ['--format=custom', '--no-owner', '--file', dumpFile, testUrl]);
  await createRestoreDatabase();
  const restore = new URL(testUrl);
  restore.pathname = `/${restoreDb}`;
  await execFileAsync('pg_restore', ['--no-owner', '--dbname', restore.toString(), dumpFile]);
  const restoredClient = new pg.Client({ connectionString: restore.toString() });
  await restoredClient.connect();
  const check = await restoredClient.query('SELECT id FROM sys_core.p7_backup_drill WHERE id = $1', [marker]);
  await restoredClient.end();
  if (check.rowCount !== 1) throw new Error('Restored database marker was not found.');
  console.log(JSON.stringify({ ok: true, backupBytes: (await fs.stat(dumpFile)).size, restoredDatabase: restoreDb }));
} finally {
  await dropRestoreDatabase().catch(() => {});
  await cleanupSourceMarker().catch(() => {});
  await fs.rm(backupDir, { recursive: true, force: true });
}
