import { withAdminErrorBoundary, requirePermission, okResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { activateHistoricalBanner, deleteHistoricalBanner } from '@/lib/services/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 一键激活应用历史横幅
async function handlePOST(request, { params }) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  const resolvedParams = await params;
  const id = resolvedParams?.id;
  const result = await activateHistoricalBanner({
    id,
    actor: guard.user,
    requestId: guard.requestId,
  });

  if (result.error) {
    return resultErrorResponse(result.error, guard.requestId);
  }

  return okResponse(result.banner, guard.requestId);
}

// 删除历史横幅记录
async function handleDELETE(request, { params }) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  const resolvedParams = await params;
  const id = resolvedParams?.id;
  const result = await deleteHistoricalBanner({
    id,
    actor: guard.user,
    requestId: guard.requestId,
  });

  if (result.error) {
    return resultErrorResponse(result.error, guard.requestId);
  }

  return okResponse({ success: true, id }, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
export const DELETE = withAdminErrorBoundary(handleDELETE);
