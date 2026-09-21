import 'server-only';

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { query, queryMany, nowIso, withTransaction } from './index.js';

const MIGRATIONS_DIR = path.join(process.cwd(), 'lib', 'db', 'migrations');
const MIGRATION_LOCK_KEY = 'koyosim:postgresql:migrations';

function migrationVersion(fileName) { return fileName.replace(/\.sql$/i, ''); }
function checksum(sql) { return crypto.createHash('sha256').update(sql, 'utf8').digest('hex'); }

async function readMigrationFiles() {
  const entries = (await fs.readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b, 'en'));
  return Promise.all(entries.map(async (fileName) => {
    const rawSql = await fs.readFile(path.join(MIGRATIONS_DIR, fileName), 'utf8');
    const sql = rawSql.replace(/^\uFEFF/, '');
    return { fileName, version: migrationVersion(fileName), sql, checksum: checksum(sql) };
  }));
}

async function ensureLedger(tx) {
  await tx.query('CREATE SCHEMA IF NOT EXISTS sys_core');
  await tx.query(`
    CREATE TABLE IF NOT EXISTS sys_core.schema_migrations (
      version TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      checksum TEXT,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      execution_ms INTEGER NOT NULL DEFAULT 0
    )
  `);
  await tx.query('ALTER TABLE sys_core.schema_migrations ADD COLUMN IF NOT EXISTS checksum TEXT');
  await tx.query('ALTER TABLE sys_core.schema_migrations ADD COLUMN IF NOT EXISTS execution_ms INTEGER NOT NULL DEFAULT 0');
}

export async function runMigrations() {
  const files = await readMigrationFiles();

  // 先无锁读账本：已经收敛时直接返回，不进事务抢 advisory lock。
  // 并发调用方（多实例启动、集成测试多个文件同时自检）会在这把锁上排队，
  // 排队超过 lock_timeout 就被取消 —— 而它们其实一行都不用改。
  const ledger = await queryMany('SELECT version, checksum FROM sys_core.schema_migrations')
    .then((rows) => new Map((rows.rows || rows).map((row) => [row.version, row])))
    .catch(() => null);
  if (ledger && files.every((file) => {
    const row = ledger.get(file.version);
    return row && (!row.checksum || row.checksum === file.checksum);
  })) {
    return files.map((file) => ({ version: file.version, status: 'already_applied' }));
  }

  return withTransaction(async (tx) => {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1))', [MIGRATION_LOCK_KEY]);
    await ensureLedger(tx);

    const applied = new Map((await tx.queryMany(
      'SELECT version, checksum FROM sys_core.schema_migrations ORDER BY version'
    )).map((row) => [row.version, row]));
    const result = [];

    for (const migration of files) {
      const previous = applied.get(migration.version);
      if (previous) {
        if (previous.checksum && previous.checksum !== migration.checksum) {
          throw new Error(`Migration checksum mismatch for ${migration.version}; refusing to continue.`);
        }
        result.push({ version: migration.version, status: 'already_applied' });
        continue;
      }

      const startedAt = Date.now();
      console.log(`[migrate] applying: ${migration.fileName}`);
      try {
        await tx.query(migration.sql);
      } catch (err) {
        console.error(`[migrate] FAILED on ${migration.fileName}:`, err.message, err.code, err.detail);
        throw err;
      }
      await tx.query(`
        INSERT INTO sys_core.schema_migrations (version, name, checksum, applied_at, execution_ms)
        VALUES ($1, $2, $3, $4, $5)
      `, [migration.version, migration.fileName, migration.checksum, nowIso(), Date.now() - startedAt]);
      result.push({ version: migration.version, status: 'applied' });
    }
    return result;
  });
}

export async function getMigrationStatus() {
  const files = await readMigrationFiles();
  const applied = await queryMany('SELECT version, name, checksum, applied_at, execution_ms FROM sys_core.schema_migrations ORDER BY version');
  const appliedByVersion = new Map(applied.map((row) => [row.version, row]));
  const pending = files.filter((file) => !appliedByVersion.has(file.version)).map((file) => file.version);
  const drifted = files.filter((file) => {
    const row = appliedByVersion.get(file.version);
    return row?.checksum && row.checksum !== file.checksum;
  }).map((file) => file.version);
  return { ok: pending.length === 0 && drifted.length === 0, applied, pending, drifted, latest: applied.at(-1)?.version || null };
}
