import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

test('P4 permissions separate models, coupons and exports by operator role', async () => {
  const { PERMISSIONS, hasPermission } = await import('../../lib/admin/permissions.js');
  assert.equal(hasPermission('operations_admin', PERMISSIONS.modelsWrite), true);
  assert.equal(hasPermission('finance_admin', PERMISSIONS.modelsWrite), false);
  assert.equal(hasPermission('finance_admin', PERMISSIONS.couponsWrite), true);
  assert.equal(hasPermission('support_admin', PERMISSIONS.couponsWrite), false);
  assert.equal(hasPermission('auditor', PERMISSIONS.exportsRead), true);
  assert.equal(hasPermission('support_admin', PERMISSIONS.exportsRead), false);
});

test('P4 authorization matrix covers ordinary, operator, finance, support, auditor and super-admin identities', async () => {
  const { authorizePermission } = await import('../../lib/admin/authz.js');
  const { PERMISSIONS } = await import('../../lib/admin/permissions.js');
  const cases = [
    ['user', PERMISSIONS.dashboardRead, false],
    ['operations_admin', PERMISSIONS.modelsWrite, true],
    ['operations_admin', PERMISSIONS.billingWrite, false],
    ['finance_admin', PERMISSIONS.billingWrite, true],
    ['finance_admin', PERMISSIONS.moderationWrite, false],
    ['support_admin', PERMISSIONS.usersRead, true],
    ['support_admin', PERMISSIONS.exportsRead, false],
    ['auditor', PERMISSIONS.exportsRead, true],
    ['auditor', PERMISSIONS.exportsWrite, false],
    ['super_admin', PERMISSIONS.exportsWrite, true],
  ];
  for (const [role, permission, expected] of cases) {
    const result = authorizePermission({ id: `${role}_1`, email: `${role}@test.invalid`, role }, permission, 'matrix-test');
    assert.equal(result.ok, expected, `${role} ${permission} authorization mismatch`);
  }
});

test('P4 dashboard contract is stable for empty, partial and degraded data', async () => {
  const { emptyDashboardSnapshot, normalizeDashboardSnapshot, REPORT_TIMEZONE } = await import('../../lib/services/dashboard.js');
  const empty = emptyDashboardSnapshot({ failedSections: ['orders'] });
  assert.equal(empty.meta.contractVersion, 'p4.v1');
  assert.equal(empty.meta.reportTimezone, REPORT_TIMEZONE);
  assert.equal(empty.meta.degraded, true);
  assert.equal(empty.trends.last7Days.length, 7);
  assert.equal(empty.metrics.grossMarginPct, 100);

  const normalized = normalizeDashboardSnapshot({ metrics: { users: '4', grossMarginPct: 999 }, trends: { last7Days: [{ date: 'x', label: 'x', count: -2 }] } });
  assert.equal(normalized.metrics.users, 4);
  assert.equal(normalized.metrics.grossMarginPct, 100);
  assert.equal(normalized.trends.last7Days.length, 7);
  assert.equal(normalized.trends.last7Days.at(-1).count, 0);
});

test('P4 exports minimize sensitive fields and mask email addresses', async () => {
  const { EXPORT_DEFINITIONS, getExportDefinition, maskEmail, toCsvString } = await import('../../lib/services/exports.js');
  assert.equal(getExportDefinition('users'), EXPORT_DEFINITIONS.users);
  assert.equal(maskEmail('alice@example.com'), 'al***@example.com');
  assert.equal(maskEmail('a@example.com'), 'a*@example.com');
  assert.equal(EXPORT_DEFINITIONS.users.headers.includes('credits'), false);
  assert.equal(EXPORT_DEFINITIONS.users.headers.includes('email'), false);
  assert.match(toCsvString(['id', 'email_masked'], [{ id: 'u1', email_masked: 'a*@example.com', email: 'secret@example.com' }]), /a\*@example\.com/);
  assert.doesNotMatch(toCsvString(EXPORT_DEFINITIONS.users.headers, [{ id: 'u1', email_masked: 'a*@example.com', email: 'secret@example.com', credits: 999 }]), /secret@example\.com|999/);
});

test('P4 high-risk routes require idempotency and legacy synchronous export is disabled', async () => {
  const routes = [
    'app/api/admin/coupons/route.js',
    'app/api/admin/models/[id]/route.js',
    'app/api/admin/plans/[id]/route.js',
    'app/api/admin/settings/route.js',
    'app/api/admin/users/[id]/route.js',
    'app/api/admin/users/[id]/credits/adjust/route.js',
    'app/api/admin/users/[id]/sessions/revoke/route.js',
    'app/api/admin/users/[id]/tags/route.js',
    'app/api/admin/orders/[id]/refund/route.js',
    'app/api/admin/webhooks/[id]/replay/route.js',
    'app/api/admin/admins/[id]/role/route.js',
    'app/api/admin/providers/[id]/secret/route.js',
    'app/api/admin/providers/[id]/test/route.js',
    'app/api/admin/moderation/[id]/resolve/route.js',
    'app/api/admin/generations/[id]/retry/route.js',
    'app/api/admin/exports/route.js',
  ];
  for (const relative of routes) {
    const source = await fs.readFile(path.join(repoRoot, relative), 'utf8');
    assert.match(source, /getRequiredIdempotencyKey/, `${relative} must validate Idempotency-Key`);
    assert.match(source, /checkIdempotency/, `${relative} must check duplicate requests`);
    assert.match(source, /completeIdempotency/, `${relative} must cache the result`);
  }
  const legacy = await fs.readFile(path.join(repoRoot, 'app/api/admin/export/[type]/route.js'), 'utf8');
  assert.match(legacy, /同步导出接口已停用/);
});

test('P4 migration creates expiring, auditable export jobs', async () => {
  const migration = await fs.readFile(path.join(repoRoot, 'lib/db/migrations/008_admin_operations.sql'), 'utf8');
  assert.match(migration, /CREATE TABLE IF NOT EXISTS sys_core\.admin_export_jobs/);
  assert.match(migration, /requested_by TEXT NOT NULL REFERENCES auth_usr\.users/);
  assert.match(migration, /content_text TEXT/);
  assert.match(migration, /expires_at TIMESTAMPTZ NOT NULL/);
  assert.match(migration, /status IN \('queued', 'running', 'succeeded', 'failed', 'expired'\)/);
});

test('P4 admin server pages enforce the same permission boundary as their APIs', async () => {
  async function listPages(directory) {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = [];
    for (const entry of entries) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) files.push(...await listPages(fullPath));
      else if (entry.isFile() && entry.name === 'page.js') files.push(fullPath);
    }
    return files;
  }
  const pages = await listPages(path.join(repoRoot, 'app', 'admin'));
  assert.ok(pages.length >= 20);
  for (const file of pages) {
    const relative = path.relative(repoRoot, file);
    // /admin/forbidden is where requireAdminPagePermission redirects *to*; guarding
    // it with a permission it by definition lacks would bounce the visitor forever.
    if (relative === path.join('app', 'admin', 'forbidden', 'page.js')) continue;
    const source = await fs.readFile(file, 'utf8');
    assert.match(source, /requireAdminPagePermission/, `${relative} has no page permission guard`);
  }
});

test('P4 system log reads validate the log type before resolving server paths', async () => {
  const route = await source('app/api/admin/system/logs/route.js');
  assert.match(route, /requestedType/);
  assert.match(route, /\['out', 'error'\]\.includes\(requestedType\)/);
  assert.match(route, /VALIDATION_ERROR/);
});

test('P4 public checkout and entitlement code read plans from the PostgreSQL repository', async () => {
  const publicPlans = await fs.readFile(path.join(repoRoot, 'app/api/billing/plans/route.js'), 'utf8');
  const checkout = await fs.readFile(path.join(repoRoot, 'lib/services/paymentService.js'), 'utf8');
  const entitlements = await fs.readFile(path.join(repoRoot, 'lib/services/billing.js'), 'utf8');
  assert.match(publicPlans, /listPublicPlans/);
  assert.match(checkout, /findPublicPlanById/);
  assert.match(entitlements, /findPublicPlanById/);
  assert.doesNotMatch(checkout, /const plan = getPlan\(planId\)/);
});

test('P4 export status is read-only and processing is delegated to a background worker', async () => {
  const statusRoute = await source('app/api/admin/exports/[id]/route.js');
  const service = await source('lib/services/exports.js');
  const repository = await source('lib/repositories/exportJobs.js');
  const worker = await source('scripts/export-worker.mjs');
  const unit = await source('scripts/koyosim-export-worker.service');

  assert.doesNotMatch(statusRoute, /processExportJob/);
  assert.match(service, /runExportWorkerOnce/);
  assert.match(service, /listQueuedExportJobs/);
  assert.match(repository, /WHERE status = 'queued'/);
  assert.match(worker, /EXPORT_WORKER_INTERVAL_MS/);
  assert.match(worker, /EXPORT_WORKER_ONCE/);
  assert.match(unit, /ExecStart=.*export-worker\.mjs/);
});
