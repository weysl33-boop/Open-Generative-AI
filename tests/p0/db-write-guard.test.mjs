import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 本地 `DATABASE_URL` 经隧道指向 127.0.0.1:5432 的**生产**集群，任何一次性脚本
// 只要忘了覆写连接串就直接写进线上库（本仓库已发生过一次目录对账误写）。所以
// "谁可以写生产库" 必须同时由 lib/db 的运行时漏斗和源码形状门禁把住。
const { scanDbWriteGuards } = await import('../../scripts/check-db-write-guard.mjs');
const { writeGuardApplies, looksLikeWriteSql, isProductionDatabaseName } = await import('../../lib/db/write-policy.js');

test('P0 every database-reaching script states its production-write policy', () => {
  assert.deepEqual(scanDbWriteGuards(), []);
});

test('P0 the live database name is the one the guard refuses', () => {
  assert.equal(isProductionDatabaseName('koyosim_ai'), true);
  assert.equal(isProductionDatabaseName('koyosim_ai'.toUpperCase()), true);
  assert.equal(isProductionDatabaseName('open_generative_ai_test'), false);
});

test('P0 only the two resident daemons may declare themselves as services', () => {
  const services = ['generation-worker.mjs', 'export-worker.mjs'];
  for (const name of fs.readdirSync(path.resolve('scripts')).filter((n) => /\.(mjs|js)$/.test(n))) {
    const text = fs.readFileSync(path.resolve('scripts', name), 'utf8');
    const declares = /process\.env\.KOYOSIM_RUNTIME\s*=\s*['"]service['"]/.test(text);
    if (services.includes(name)) {
      assert.equal(declares, true, `${name} must declare KOYOSIM_RUNTIME=service`);
    } else {
      assert.equal(declares, false, `scripts/${name} must not claim to be a resident service`);
    }
  }
});

test('P0 the write guard exempts the Next server but not ad-hoc entry points', () => {
  const previous = process.env.KOYOSIM_RUNTIME;
  const previousGuard = process.env.KOYOSIM_DB_WRITE_GUARD;
  delete process.env.KOYOSIM_RUNTIME;
  try {
    assert.equal(writeGuardApplies(path.resolve('scripts/one-off.mjs')), true);
    assert.equal(writeGuardApplies(''), true);
    assert.equal(writeGuardApplies(path.resolve('node_modules/next/dist/bin/next')), false);
    assert.equal(writeGuardApplies('/usr/local/lib/node_modules/.bin/next'), false);
    assert.equal(writeGuardApplies(path.join(process.cwd(), '.next', 'server', 'index.js')), false);
    // Windows cannot rename its process, so the title branch is asserted through
    // the injectable option instead of by mutating `process.title`.
    assert.equal(writeGuardApplies(path.resolve('scripts/one-off.mjs'), { title: 'next-server (v15.5.15)' }), false);
    assert.equal(writeGuardApplies(path.resolve('scripts/one-off.mjs'), { title: 'node' }), true);
    process.env.KOYOSIM_RUNTIME = 'service';
    assert.equal(writeGuardApplies(path.resolve('scripts/generation-worker.mjs')), false);
  } finally {
    if (previous === undefined) delete process.env.KOYOSIM_RUNTIME;
    else process.env.KOYOSIM_RUNTIME = previous;
    if (previousGuard === undefined) delete process.env.KOYOSIM_DB_WRITE_GUARD;
    else process.env.KOYOSIM_DB_WRITE_GUARD = previousGuard;
  }
});

test('P0 a single environment flag cannot bypass the production-write guard', () => {
  const previous = process.env.KOYOSIM_DB_WRITE_GUARD;
  process.env.KOYOSIM_DB_WRITE_GUARD = 'off';
  try {
    assert.equal(writeGuardApplies(path.resolve('scripts/one-off.mjs')), true);
  } finally {
    if (previous === undefined) delete process.env.KOYOSIM_DB_WRITE_GUARD;
    else process.env.KOYOSIM_DB_WRITE_GUARD = previous;
  }
});

test('P0 write classifier separates reads from writes', () => {
  for (const sql of ['SELECT 1', 'SELECT * FROM auth_usr.users FOR UPDATE', '/* insert */ SELECT 1', '-- update\nSELECT 1']) {
    assert.equal(looksLikeWriteSql(sql), false, sql);
  }
  for (const sql of ['INSERT INTO a VALUES (1)', 'UPDATE a SET b = 1', 'DELETE FROM a', 'WITH x AS (SELECT 1) INSERT INTO a SELECT * FROM x', 'CREATE TABLE a (b int)', 'ALTER TABLE a ADD COLUMN b text']) {
    assert.equal(looksLikeWriteSql(sql), true, sql);
  }
});

// 自检：只会返回 0 的扫描器等于没有门禁，所以必须证明它能抓到本次要防的写法。
test('P0 scanner flags the bypasses it exists to stop', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'db-guard-'));
  try {
    fs.writeFileSync(path.join(dir, 'oops.mjs'), "import { execute } from '../lib/db/index.js';\nawait execute('UPDATE users SET credits = 0');\n");
    fs.writeFileSync(path.join(dir, 'raw-pool.mjs'), "import { getPgPool } from '../lib/db/index.js';\nawait getPgPool().query('SELECT 1');\n");
    fs.writeFileSync(path.join(dir, 'fake-service.mjs'), "process.env.KOYOSIM_RUNTIME = 'service';\nimport { execute } from '../lib/db/index.js';\nawait execute('DELETE FROM users');\n");
    fs.writeFileSync(path.join(dir, 'guarded.mjs'), "import { execute } from '../lib/db/index.js';\nimport { assertSandboxDatabase } from './require-sandbox-db.mjs';\nawait assertSandboxDatabase();\nawait execute('DELETE FROM users');\n");
    fs.writeFileSync(path.join(dir, 'scratch.mjs'), "const testUrl = String(process.env.TEST_DATABASE_URL || '').trim();\nif (!testUrl) process.exit(1);\nprocess.env.DATABASE_URL = scratch;\nconst { Client } = await import('pg');\n");
    const problems = scanDbWriteGuards([dir], dir);
    const forFile = (name) => problems.filter((problem) => problem.startsWith(`${name}:`));
    assert.deepEqual(forFile('guarded.mjs'), [], forFile('guarded.mjs').join('\n'));
    assert.deepEqual(forFile('scratch.mjs'), [], forFile('scratch.mjs').join('\n'));
    assert.equal(forFile('oops.mjs').length, 1, forFile('oops.mjs').join('\n'));
    assert.match(forFile('oops.mjs')[0], /reaches the database without a production-write guard/);
    assert.match(forFile('raw-pool.mjs').join('\n'), /takes a raw connection pool/);
    assert.match(forFile('fake-service.mjs').join('\n'), /declares KOYOSIM_RUNTIME=service/);
    assert.equal(problems.length, forFile('oops.mjs').length + forFile('raw-pool.mjs').length + forFile('fake-service.mjs').length, problems.join('\n'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('P0 lib/db funnels every write path through the guard', () => {
  const source = fs.readFileSync(path.resolve('lib/db/pg.js'), 'utf8');
  assert.match(source, /from '\.\/write-policy\.js'/);
  // One definition plus one call in query() and in each transaction wrapper.
  assert.equal(
    (source.match(/assertWriteAllowed\(/g) || []).length,
    6,
    'query() and all four transaction wrappers must each re-check the target database',
  );
});
