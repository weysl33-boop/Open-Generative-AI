import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getDashboardOverview } from '@/lib/services/dashboard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = requirePermission(request, PERMISSIONS.dashboardRead);
  if (!guard.ok) return guard.response;

  const data = getDashboardOverview();
  return okResponse(data, guard.requestId);
}
