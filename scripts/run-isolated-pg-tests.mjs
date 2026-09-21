import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import pg from 'pg';
import { requireIsolatedTestDatabase } from './test-database-guard.mjs';

try {
  if (typeof process.loadEnvFile === 'function' && fsSync.existsSync('.env.local')) {
    process.loadEnvFile('.env.local');
  }
} catch {}

const baseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const parsed = requireIsolatedTestDatabase(baseUrl, process.env.DATABASE_URL, 'TEST_DATABASE_URL');

const databaseName = `p7_it_${crypto.randomBytes(6).toString('hex')}`;
const adminUrl = new URL(parsed);
adminUrl.pathname = '/postgres';
const isolatedUrl = new URL(parsed);
isolatedUrl.pathname = `/${databaseName}`;

async function withAdmin(callback) {
  const client = new pg.Client({ connectionString: adminUrl.toString() });
  await client.connect();
  try {
    return await callback(client);
  } finally {
    await client.end();
  }
}

async function createDatabase() {
  await withAdmin((client) => client.query(`CREATE DATABASE "${databaseName}"`));
}

async function dropDatabase() {
  await withAdmin((client) => client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`));
}

function run(args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { stdio: 'inherit', env, windowsHide: true });
    child.once('error', reject);
    child.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

// 允许 `npm run test:db -- tests/db/x.test.mjs` 只跑指定文件，
// 便于定位单个集成用例；不带参数时仍然是全量并行跑。
const requested = process.argv.slice(2).filter((arg) => arg.startsWith('tests/'));
const testFiles = requested.length
  ? requested
  : (await fs.readdir(path.resolve('tests/db')))
    .filter((name) => name.endsWith('.mjs'))
    .sort()
    .map((name) => path.join('tests/db', name));

try {
  await createDatabase();
  const isolated = isolatedUrl.toString();
  const childEnv = {
    ...process.env,
    TEST_DATABASE_URL: isolated,
    // The integration test module deliberately switches DATABASE_URL to the
    // isolated URL after verifying that TEST_DATABASE_URL is not the app DB.
    DATABASE_URL: baseUrl,
  };

  // 迁移由这里统一做一遍；各测试文件自检时只会走「已收敛」的无锁快路径。
  const migrateCode = await run(['scripts/migrate.mjs'], {
    ...process.env,
    DATABASE_URL: isolated,
    TEST_DATABASE_URL: isolated,
  });
  if (migrateCode !== 0) throw new Error('隔离库迁移失败');

  // 文件之间必须串行：所有测试文件共用这一个隔离库，而网关状态（ai_providers 的熔断/健康）、
  // models_config 与在途尝试计数都是全局行。并行时 A 文件的探针会改掉 B 文件赖以断言的共享行，
  // 表现为「单独跑全绿、全量跑随机红」。
  const exitCode = await run([
    '--experimental-loader',
    './scripts/server-only-loader.mjs',
    '--test',
    '--test-concurrency=1',
    ...testFiles,
  ], childEnv);
  if (exitCode !== 0) process.exitCode = exitCode;
} finally {
  await dropDatabase();
}
