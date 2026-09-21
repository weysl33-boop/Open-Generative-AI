import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('known async API boundaries explicitly await persistence calls', async () => {
  const expectations = [
    ['app/api/models/active/route.js', /const models = await listActiveModels\(\)/],
    ['app/api/auth/register/route.js', /await getSettingByKey\('maintenance_mode'\)/],
    ['app/api/auth/register/route.js', /await getSettingByKey\('registration_enabled'\)/],
    ['app/layout.js', /const user = await getUserBySession\(sessionToken\)/],
    ['app/layout.js', /await getSettingByKey\('site_banner'\)/],
    ['app/layout.js', /await getSettingByKey\('maintenance_mode'\)/],
    ['app/api/admin/generations/route.js', /const clusters = await getAdminGenerationFailureClusters\(\)/],
    ['app/api/admin/generations/route.js', /const result = await listFailedAdminGenerations\(url\.searchParams\)/],
    ['app/api/admin/users/[id]/sessions/revoke/route.js', /const result = await revokeUserSessions\(/],
    ['app/api/admin/admins/[id]/role/route.js', /if \(!await verifyAdminPassword\(/],
    ['app/api/admin/providers/[id]/secret/route.js', /const res = await rotateProviderSecret\(/],
    ['app/api/admin/dashboard/route.js', /const data = await getDashboardOverview\(\)/],
  ];

  for (const [relativePath, pattern] of expectations) {
    assert.match(await source(relativePath), pattern, `${relativePath} is missing an awaited async boundary`);
  }
});

test('dashboard exposes the canonical trends shape consumed by the admin page', async () => {
  const dashboard = await source('lib/services/dashboard.js');
  const page = await source('app/admin/page.js');
  assert.match(dashboard, /trends:\s*\{\s*last7Days\s*\}/);
  assert.match(page, /const \{ metrics, trends, risks, recentAudit \} = data/);
  assert.doesNotMatch(dashboard, /^\s*trend:\s*last7Days,/m);
});
