import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('P7 CI uses PostgreSQL 16 and keeps application and test databases separate', async () => {
  const workflow = await source('.github/workflows/ci.yml');

  assert.match(workflow, /image:\s*postgres:16/);
  assert.match(workflow, /DATABASE_URL:\s*postgresql:\/\/[^\n]+\/open_generative_ai\s*$/m);
  assert.match(workflow, /TEST_DATABASE_URL:\s*postgresql:\/\/[^\n]+\/open_generative_ai_test\s*$/m);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run db:migrate:test/);
  assert.match(workflow, /npm run migration:drill/);
  assert.match(workflow, /npm run backup:restore:drill/);
});

test('P7 CI includes static, repository, build and browser gates', async () => {
  const workflow = await source('.github/workflows/ci.yml');
  const packageJson = JSON.parse(await source('package.json'));

  for (const command of [
    'npm run format:check',
    'npm run lint',
    'npm run release:check',
    'npm run security:secrets',
    'npm run test:i18n',
    'npm run test:db',
    'npm run build:studio',
    'npm run vite:build',
    'npm run build',
    'npx playwright install --with-deps chromium',
    'npm run test:e2e',
  ]) {
    assert.match(workflow, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }

  assert.match(packageJson.scripts['test:ci'], /format:check/);
  assert.match(packageJson.scripts['test:ci'], /release:check/);
  assert.match(packageJson.scripts['test:ci'], /security:secrets/);
  assert.match(packageJson.scripts['test:ci'], /build:studio/);
  assert.match(packageJson.scripts['test:ci'], /vite:build/);
  assert.match(packageJson.scripts['test:ci'], /build/);
});

test('P7 destructive rehearsal scripts refuse the application database', async () => {
  for (const file of ['scripts/migration-drill.mjs', 'scripts/backup-restore-drill.mjs', 'scripts/e2e-seed.mjs', 'scripts/e2e-clean.mjs']) {
    const script = await source(file);
    assert.match(script, /TEST_DATABASE_URL/);
    assert.match(script, /requireIsolatedTestDatabase/);
  }
});

test('P7 browser configuration keeps the app process on the isolated test database', async () => {
  const config = await source('playwright.config.mjs');
  const seed = await source('scripts/e2e-seed.mjs');

  assert.match(config, /testDir:\s*['"]\.\/tests\/e2e['"]/);
  assert.match(config, /npm run start/);
  assert.match(seed, /E2E_SESSION_FILE/);
  assert.match(seed, /auth_usr\.users/);
  assert.match(seed, /auth_usr\.sessions/);
  assert.match(config, /E2E_TEST_MODE:\s*['"]true['"]/);
  assert.match(config, /ALLOW_MOCK_GENERATION:\s*['"]true['"]/);
  assert.match(config, /DATABASE_URL:\s*e2eDatabaseUrl/);
  assert.match(config, /requireIsolatedTestDatabase/);
});

test('P7 test database guard rejects same target with different credentials and non-test names', async () => {
  const { requireIsolatedTestDatabase } = await import('../../scripts/test-database-guard.mjs');
  assert.throws(
    () => requireIsolatedTestDatabase(
      'postgresql://test_user:test_pass@db.internal:5432/open_generative_ai_test',
      'postgresql://app_user:app_pass@db.internal:5432/open_generative_ai_test',
    ),
    /same database as DATABASE_URL/,
  );
  assert.throws(
    () => requireIsolatedTestDatabase('postgresql://test_user:test_pass@db.internal:5432/open_generative_ai', ''),
    /explicit test name/,
  );
  assert.equal(
    requireIsolatedTestDatabase('postgresql://test_user:test_pass@db.internal:5432/open_generative_ai_test', '').pathname,
    '/open_generative_ai_test',
  );
});

test('P7 database integration tests create and remove an isolated temporary database', async () => {
  const runner = await source('scripts/run-isolated-pg-tests.mjs');
  const packageJson = JSON.parse(await source('package.json'));

  assert.match(packageJson.scripts['test:db'], /run-isolated-pg-tests/);
  assert.match(runner, /TEST_DATABASE_URL/);
  assert.match(runner, /CREATE DATABASE/);
  assert.match(runner, /DROP DATABASE IF EXISTS/);
  assert.match(runner, /WITH \(FORCE\)/);
  assert.match(runner, /finally \{\s*await dropDatabase\(\);\s*\}/);
});

test('P7 provides a supervised generation worker with bounded restart backoff', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  const supervisor = await source('scripts/generation-worker-supervisor.mjs');

  assert.match(packageJson.scripts['worker:generation:supervised'], /require-database-url\.mjs/);
  assert.match(packageJson.scripts['worker:generation:supervised'], /generation-worker-supervisor\.mjs/);
  assert.match(supervisor, /GENERATION_WORKER_MAX_RESTARTS/);
  assert.match(supervisor, /restart budget exhausted/);
  assert.match(supervisor, /setTimeout/);
  assert.match(supervisor, /child\?\.kill\(signal\)/);
});

test('P7 production deployment consumes a prebuilt artifact and retains rollback state', async () => {
  const deploy = await source('scripts/deploy-safe.mjs');
  assert.match(deploy, /DEPLOY_ARTIFACT_DIR is required/);
  assert.match(deploy, /BUILD_ID/);
  assert.doesNotMatch(deploy, /build-safe\.mjs/);
  assert.doesNotMatch(deploy, /next build/);
  assert.match(deploy, /\.next-previous/);
  assert.match(deploy, /rollbackRelease/);
  assert.match(deploy, /systemctl.*restart/);
});
