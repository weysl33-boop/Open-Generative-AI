import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import pg from 'pg';
import { requireIsolatedTestDatabase } from './test-database-guard.mjs';

try {
  if (typeof process.loadEnvFile === 'function' && fsSync.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const sourceUrl = String(process.env.TEST_DATABASE_URL || '').trim();
requireIsolatedTestDatabase(sourceUrl, process.env.DATABASE_URL, 'TEST_DATABASE_URL');

const parsed = new URL(sourceUrl);
const adminUrl = new URL(sourceUrl);
adminUrl.pathname = '/postgres';
const prefix = `p7_${crypto.randomBytes(5).toString('hex')}`;
const emptyDb = `${prefix}_empty`;
const upgradeDb = `${prefix}_upgrade`;
const migrationDir = path.resolve('lib/db/migrations');
const files = (await fs.readdir(migrationDir)).filter((name) => name.endsWith('.sql')).sort((a, b) => a.localeCompare(b));
const upgradeStart = files.findIndex((name) => name.startsWith('009_'));
if (upgradeStart === -1) throw new Error('P6 payment migration 009 is missing from the migration rehearsal.');
const sqlByFile = new Map(await Promise.all(files.map(async (name) => [
  name,
  (await fs.readFile(path.join(migrationDir, name), 'utf8')).replace(/^\uFEFF/, ''),
])));
for (const [name, sql] of sqlByFile) {
  if (/DROP\s+COLUMN/i.test(sql)) throw new Error(`${name} contains DROP COLUMN; release migrations must be forward-compatible.`);
}


async function createDatabase(name) {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try { await client.query(`CREATE DATABASE "${name}"`); } finally { await client.end(); }
}
async function dropDatabase(name) {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try { await client.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`); } finally { await client.end(); }
}
async function apply(name, selectedFiles) {
  const url = new URL(sourceUrl);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    for (const file of selectedFiles) await client.query(sqlByFile.get(file));
  } finally { await client.end(); }
}

try {
  await createDatabase(emptyDb);
  await createDatabase(upgradeDb);
  await apply(emptyDb, files);
  // Simulate a pre-P6 release at migration 008, then apply every subsequent
  // migration in the same order used by the production migration runner.
  await apply(upgradeDb, files.slice(0, upgradeStart));
  await apply(upgradeDb, files.slice(upgradeStart));
  console.log(JSON.stringify({ ok: true, emptyDatabase: emptyDb, upgradeDatabase: upgradeDb, migrationCount: files.length }));
} finally {
  await dropDatabase(emptyDb);
  await dropDatabase(upgradeDb);
}
