import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getDashboardOverview } from '@/lib/services/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.dashboardRead);
  if (!guard.ok) return guard.response;

  const data = await getDashboardOverview();
  return okResponse(data, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
