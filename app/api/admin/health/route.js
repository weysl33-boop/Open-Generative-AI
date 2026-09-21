import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getSystemHealth } from '@/lib/services/systemHealth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.healthRead);
  if (!guard.ok) return guard.response;
  try {
    const { database, migrations, providers, checkedAt } = await getSystemHealth();
    return okResponse({
      status: database.ok && migrations.ok ? 'healthy' : 'degraded',
      uptimeSeconds: Math.floor(process.uptime()),
      runtime: { node: process.version, platform: process.platform, memory: { rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024), heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) } },
      database: { engine: 'PostgreSQL 16', ...database, migrations },
      providers,
      checkedAt,
    }, guard.requestId);
  } catch (error) {
    return okResponse({ status: 'unhealthy', database: { engine: 'PostgreSQL 16', ok: false, error: error.code || 'DATABASE_UNAVAILABLE' } }, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
