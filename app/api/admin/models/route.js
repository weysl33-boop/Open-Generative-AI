import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getAllModelsOverview } from '@/lib/services/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead || PERMISSIONS.dashboardRead);
  if (!guard.ok) return guard.response;

  const models = await getAllModelsOverview();
  return okResponse({ models }, guard.requestId);
}
