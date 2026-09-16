import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { healthCheck, nowIso } from '@/lib/db';
import { getMigrationStatus } from '@/lib/db/migrations';
import { getProvidersOverview } from '@/lib/services/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = await requirePermission(request, PERMISSIONS.healthRead);
  if (!guard.ok) return guard.response;
  try {
    const [database, migrations, providers] = await Promise.all([healthCheck(), getMigrationStatus(), getProvidersOverview()]);
    return okResponse({
      status: database.ok && migrations.ok ? 'healthy' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      runtime: { node: process.version, platform: process.platform, memory: { rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024), heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) } },
      database: { engine: 'PostgreSQL 16', ...database, migrations },
      providers,
      checkedAt: nowIso(),
    }, guard.requestId);
  } catch (error) {
    return okResponse({ status: 'unhealthy', database: { engine: 'PostgreSQL 16', ok: false, error: error.code || 'DATABASE_UNAVAILABLE' }, checkedAt: nowIso() }, guard.requestId);
  }
}
