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
const userIdRootStart = files.findIndex((name) => name.startsWith('037_user_id_root_and_allocator'));
const sqlByFile = new Map(await Promise.all(files.map(async (name) => [
  name,
  (await fs.readFile(path.join(migrationDir, name), 'utf8')).replace(/^\uFEFF/, ''),
])));

// This one explicitly authorized root-key conversion removes only the two
// superseded aliases. Every other release migration remains forward-only.
const destructiveColumnAllowlist = new Map([
  ['037_user_id_root_and_allocator.sql', ['user_number', 'uuid']],
]);
for (const [name, sql] of sqlByFile) {
  const droppedColumns = [...sql.matchAll(/\bDROP\s+COLUMN(?:\s+IF\s+EXISTS)?\s+([a-z_][a-z0-9_]*)/gi)]
    .map((match) => match[1].toLowerCase())
    .sort();
  if (!droppedColumns.length) continue;
  const allowedColumns = destructiveColumnAllowlist.get(name);
  if (!allowedColumns || JSON.stringify(droppedColumns) !== JSON.stringify([...allowedColumns].sort())) {
    throw new Error(`${name} contains an unapproved DROP COLUMN; release migrations must be forward-compatible.`);
  }
}

async function seedUserIdRootFixture(name) {
  const url = new URL(sourceUrl);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    await client.query(`
      INSERT INTO auth_usr.users (id, user_number, email, display_name, role, credits, status)
      VALUES
        ('usr_fixture_a', '100001', 'fixture-a@example.test', 'Fixture A', 'user', 0, 'active'),
        ('usr_fixture_b', '100002', 'fixture-b@example.test', 'Fixture B', 'user', 0, 'active')
    `);
    await client.query(`
      INSERT INTO auth_usr.auth_accounts (id, user_id, provider, provider_user_id, provider_email, created_at, updated_at)
      VALUES ('acc_fixture_a', 'usr_fixture_a', 'email', 'fixture-a@example.test', 'fixture-a@example.test', now(), now())
    `);
    await client.query(`
      INSERT INTO auth_usr.oauth_accounts (provider, provider_user_id, user_id, email, profile_json)
      VALUES ('google', 'google-fixture-a', 'usr_fixture_a', 'fixture-a@example.test', '{}'::jsonb)
    `);
    await client.query(`
      INSERT INTO auth_usr.sessions (token_hash, user_id, expires_at, created_at)
      VALUES ('fixture-session-hash', 'usr_fixture_a', now() + interval '1 day', now())
    `);
    await client.query(`
      INSERT INTO ai_studio.creations (id, user_id, studio_id, label)
      VALUES ('fixture-creation', 'usr_fixture_a', 'image', 'fixture')
    `);
    await client.query(`
      INSERT INTO ai_studio.user_follows (id, follower_id, following_id)
      VALUES ('fixture-follow', 'usr_fixture_a', 'usr_fixture_b')
    `);
    await client.query(`
      INSERT INTO sys_core.user_activity_logs (id, user_id, event_action)
      VALUES ('fixture-activity', 'usr_fixture_a', 'fixture')
    `);
    await client.query(`
      INSERT INTO ops_bill.admin_audit_logs (id, actor_id, actor_email, action)
      VALUES ('fixture-audit', 'usr_fixture_a', 'fixture-a@example.test', 'fixture')
    `);
    await client.query(`
      INSERT INTO ops_bill.admin_notes (id, target_type, target_id, body, author_id, author_email)
      VALUES ('fixture-note', 'user', 'usr_fixture_a', 'fixture', 'usr_fixture_b', 'fixture-b@example.test')
    `);
    await client.query(`
      INSERT INTO ops_bill.user_tags (user_id, tag_id, created_at, created_by)
      VALUES ('usr_fixture_a', 'tag_new', now(), 'usr_fixture_b')
    `);
    const result = await client.query("SELECT count(*)::int AS count FROM pg_constraint WHERE contype='f' AND confrelid='auth_usr.users'::regclass");
    return result.rows[0].count;
  } finally {
    await client.end();
  }
}

async function verifyUserIdRootFixture(name, expectedForeignKeys) {
  const url = new URL(sourceUrl);
  url.pathname = `/${name}`;
  const client = new pg.Client({ connectionString: url.toString() });
  await client.connect();
  try {
    const rootIds = await client.query('SELECT id FROM auth_usr.users ORDER BY id');
    if (rootIds.rows.map((row) => row.id).join(',') !== '100001,100002') {
      throw new Error('032 user root conversion did not preserve the assigned six-digit IDs.');
    }
    const checks = [
      ['auth_usr.auth_accounts', 'user_id', 'id', 'acc_fixture_a', '100001'],
      ['auth_usr.oauth_accounts', 'user_id', 'provider_user_id', 'google-fixture-a', '100001'],
      ['auth_usr.sessions', 'user_id', 'token_hash', 'fixture-session-hash', '100001'],
      ['ai_studio.creations', 'user_id', 'id', 'fixture-creation', '100001'],
      ['ai_studio.user_follows', 'follower_id', 'id', 'fixture-follow', '100001'],
      ['ai_studio.user_follows', 'following_id', 'id', 'fixture-follow', '100002'],
      ['sys_core.user_activity_logs', 'user_id', 'id', 'fixture-activity', '100001'],
      ['ops_bill.admin_audit_logs', 'actor_id', 'id', 'fixture-audit', '100001'],
      ['ops_bill.admin_notes', 'target_id', 'id', 'fixture-note', '100001'],
      ['ops_bill.admin_notes', 'author_id', 'id', 'fixture-note', '100002'],
      ['ops_bill.user_tags', 'created_by', 'tag_id', 'tag_new', '100002'],
    ];
    for (const [table, column, keyColumn, keyValue, expected] of checks) {
      const result = await client.query(`SELECT ${column}::text AS value FROM ${table} WHERE ${keyColumn} = $1`, [keyValue]);
      if (result.rows[0]?.value !== expected) throw new Error(`032 reference conversion failed for ${table}.${column}.`);
    }
    const legacyColumns = await client.query(`
      SELECT count(*)::int AS count FROM information_schema.columns
      WHERE table_schema = 'auth_usr' AND table_name = 'users' AND column_name = ANY($1::text[])
    `, [['uuid', 'user_number']]);
    if (legacyColumns.rows[0].count !== 0) throw new Error('032 did not remove the superseded users ID columns.');
    const allocations = await client.query('SELECT count(*)::int AS count FROM auth_usr.user_id_allocations');
    if (allocations.rows[0].count !== 2) throw new Error('032 did not seed the UID allocation registry.');
    const foreignKeys = await client.query("SELECT count(*)::int AS count FROM pg_constraint WHERE contype='f' AND confrelid='auth_usr.users'::regclass");
    if (foreignKeys.rows[0].count !== expectedForeignKeys) throw new Error('032 did not restore every user foreign key.');
    return { roots: rootIds.rows.length, allocations: allocations.rows[0].count, foreignKeys: foreignKeys.rows[0].count };
  } finally {
    await client.end();
  }
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
  if (userIdRootStart >= 0) {
    await apply(upgradeDb, files.slice(upgradeStart, userIdRootStart));
    const userForeignKeys = await seedUserIdRootFixture(upgradeDb);
    await apply(upgradeDb, files.slice(userIdRootStart));
    const userIdRoot = await verifyUserIdRootFixture(upgradeDb, userForeignKeys);
    console.log(JSON.stringify({ ok: true, emptyDatabase: emptyDb, upgradeDatabase: upgradeDb, migrationCount: files.length, userIdRoot }));
  } else {
    await apply(upgradeDb, files.slice(upgradeStart));
    console.log(JSON.stringify({ ok: true, emptyDatabase: emptyDb, upgradeDatabase: upgradeDb, migrationCount: files.length }));
  }
} finally {
  await dropDatabase(emptyDb);
  await dropDatabase(upgradeDb);
}
