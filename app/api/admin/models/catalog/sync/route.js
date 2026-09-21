import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getCatalogGaps, syncLegacyCatalog } from '@/lib/services/catalogSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;
  return okResponse({ gaps: await getCatalogGaps() }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;
  return okResponse(await syncLegacyCatalog({ actor: guard.user, requestId: guard.requestId }), guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
