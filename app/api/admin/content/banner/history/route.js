import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getBannerHistory } from '@/lib/services/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentRead);
  if (!guard.ok) return guard.response;

  const history = await getBannerHistory();
  return okResponse(history, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
