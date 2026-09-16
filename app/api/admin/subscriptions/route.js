import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listSubscriptions } from '@/lib/repositories/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = requirePermission(request, PERMISSIONS.billingRead);
  if (!guard.ok) return guard.response;

  const result = listSubscriptions(request.nextUrl.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}
