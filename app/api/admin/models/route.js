import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getModelCenterSnapshot } from '@/lib/services/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const snapshot = await getModelCenterSnapshot();
  return okResponse(snapshot, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
