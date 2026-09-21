import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getAllPlansConfig } from '@/lib/services/adminRead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.plansRead);
  if (!guard.ok) return guard.response;

  const plans = await getAllPlansConfig();
  return okResponse(plans, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
