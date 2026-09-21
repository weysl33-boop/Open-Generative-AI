import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { probeFailureStatus, probeModelChannels } from '@/lib/services/healthProbe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const result = await probeModelChannels(id);
  if (!result.ok) {
    return errorResponse(result.code, result.message, probeFailureStatus(result.code), guard.requestId);
  }

  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
