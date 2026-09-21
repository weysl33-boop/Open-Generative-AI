import { withAdminErrorBoundary, requirePermission, okResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getBannerAnalytics, resetBannerAnalytics } from '@/lib/services/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentRead);
  if (!guard.ok) return guard.response;

  const url = new URL(request.url);
  const bannerId = url.searchParams.get('bannerId') || null;
  const limit = parseInt(url.searchParams.get('limit') || '50', 10);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10);

  const data = await getBannerAnalytics({ bannerId, limit, offset });
  return okResponse(data, guard.requestId);
}

async function handleDELETE(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  const result = await resetBannerAnalytics({
    actor: guard.user,
    requestId: guard.requestId,
  });

  if (result.error) {
    return resultErrorResponse(result.error, guard.requestId);
  }

  return okResponse({ reset: true }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const DELETE = withAdminErrorBoundary(handleDELETE);
