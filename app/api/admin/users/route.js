import { withAdminErrorBoundary, requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listUsers } from '@/lib/services/adminRead';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const result = await listUsers(request.nextUrl.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}

export const GET = withAdminErrorBoundary(handleGET);
