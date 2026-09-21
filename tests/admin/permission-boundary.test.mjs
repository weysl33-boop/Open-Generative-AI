import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const adminApiRoot = path.join(repoRoot, 'app', 'api', 'admin');

async function listRouteFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listRouteFiles(fullPath));
    else if (entry.isFile() && entry.name === 'route.js') files.push(fullPath);
  }
  return files;
}

function anonymousRequest() {
  return { cookies: { get: () => undefined }, headers: { get: () => null } };
}

test('anonymous administrator access is rejected with 401', async () => {
  const { requirePermission } = await import('../../lib/admin/authz.js');
  const { PERMISSIONS } = await import('../../lib/admin/permissions.js');
  const result = await requirePermission(anonymousRequest(), PERMISSIONS.dashboardRead);
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 401);
});

test('ordinary users are rejected with 403 before permission execution', async () => {
  const { authorizePermission } = await import('../../lib/admin/authz.js');
  const { PERMISSIONS } = await import('../../lib/admin/permissions.js');
  const result = authorizePermission({ id: 'user_1', role: 'user' }, PERMISSIONS.dashboardRead, 'test-request');
  assert.equal(result.ok, false);
  assert.equal(result.response.status, 403);
});

test('admin error helpers preserve the API status contract', async () => {
  const { errorResponse, resultErrorResponse, withAdminErrorBoundary } = await import('../../lib/admin/authz.js');

  assert.equal(errorResponse('NOT_FOUND', '不存在', 404, 'req-test').status, 404);
  assert.equal(resultErrorResponse('目标用户不存在', 'req-test').status, 404);
  assert.equal(resultErrorResponse('状态值无效', 'req-test').status, 422);

  const guardedHandler = withAdminErrorBoundary(async () => {
    throw new Error('database details must not leak');
  });
  const response = await guardedHandler({ headers: { get: () => 'req-test' } });
  assert.equal(response.status, 500);
  assert.equal((await response.json()).error.code, 'INTERNAL_ERROR');
});

test('every administrator route awaits the shared permission guard', async () => {
  const routeFiles = await listRouteFiles(adminApiRoot);
  assert.ok(routeFiles.length >= 26, `expected at least 26 admin routes, found ${routeFiles.length}`);

  for (const file of routeFiles) {
    const source = await fs.readFile(file, 'utf8');
    const guardCalls = source.match(/requirePermission\s*\(/g) || [];
    assert.ok(guardCalls.length > 0, `${path.relative(repoRoot, file)} has no permission guard`);
    assert.doesNotMatch(source, /(?<!await\s)requirePermission\s*\(/, `${path.relative(repoRoot, file)} has an un-awaited guard`);
    assert.match(source, /if\s*\(!guard\.ok\)\s*return guard\.response;/, `${path.relative(repoRoot, file)} does not short-circuit denied access`);
    assert.match(source, /withAdminErrorBoundary/, `${path.relative(repoRoot, file)} has no shared error boundary`);
  }
});
