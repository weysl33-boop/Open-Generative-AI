import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listAdmins } from '@/lib/repositories/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = requirePermission(request, PERMISSIONS.adminsWrite);
  if (!guard.ok) return guard.response;

  const admins = listAdmins();
  return okResponse(admins, guard.requestId);
}
