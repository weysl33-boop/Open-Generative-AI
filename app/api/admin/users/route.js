import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listUsers } from '@/lib/repositories/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const result = await listUsers(request.nextUrl.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}
