import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listAdmins } from '@/lib/services/adminRead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.adminsWrite);
  if (!guard.ok) return guard.response;

  const admins = await listAdmins();
  return okResponse(admins, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
