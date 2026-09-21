import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getProvidersOverview } from '@/lib/services/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const data = await getProvidersOverview();
  return okResponse(data, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
