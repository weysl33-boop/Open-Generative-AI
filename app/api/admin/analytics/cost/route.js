import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getCostCenterAnalytics } from '@/lib/services/analyticsFinancial';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate') || null;
  const endDate = searchParams.get('endDate') || null;
  const modelId = searchParams.get('modelId') || null;
  const providerId = searchParams.get('providerId') || null;

  const data = await getCostCenterAnalytics({ startDate, endDate, modelId, providerId });
  return okResponse(data, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
