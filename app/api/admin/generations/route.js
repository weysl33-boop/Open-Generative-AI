import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listCreations, listFailedCreations, getFailureClusters } from '@/lib/repositories/creations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = await requirePermission(request, PERMISSIONS.generationsRead);
  if (!guard.ok) return guard.response;

  const url = request.nextUrl;
  const isFailures = url.searchParams.get('failures') === '1';

  if (isFailures) {
    const clusters = getFailureClusters();
    const result = listFailedCreations(url.searchParams);
    return okResponse({ clusters, ...result }, guard.requestId, result.meta);
  }

  const result = listCreations(url.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}
