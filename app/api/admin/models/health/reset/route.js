import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { resetProviderCircuit } from '@/lib/services/circuitBreaker';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const providerId = body.providerId || body.provider_id;

  if (!providerId) {
    return errorResponse('VALIDATION_ERROR', '请指定要重置熔断器的供应商 ID', 422, guard.requestId);
  }

  const result = await resetProviderCircuit(providerId);
  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
