import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getAdminGenerationFailureClusters, listAdminGenerations, listFailedAdminGenerations } from '@/lib/services/generations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.generationsRead);
  if (!guard.ok) return guard.response;

  const url = request.nextUrl;
  const isFailures = url.searchParams.get('failures') === '1';

  if (isFailures) {
    const clusters = await getAdminGenerationFailureClusters();
    const result = await listFailedAdminGenerations(url.searchParams);
    return okResponse({ clusters, ...result }, guard.requestId, result.meta);
  }

  const result = await listAdminGenerations(url.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}

export const GET = withAdminErrorBoundary(handleGET);
