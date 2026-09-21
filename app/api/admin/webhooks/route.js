import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listWebhookEvents } from '@/lib/services/adminRead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.webhooksRead);
  if (!guard.ok) return guard.response;

  const result = await listWebhookEvents(request.nextUrl.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}

export const GET = withAdminErrorBoundary(handleGET);
