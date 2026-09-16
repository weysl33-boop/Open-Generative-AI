import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getAllPlansConfig } from '@/lib/repositories/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = requirePermission(request, PERMISSIONS.plansRead);
  if (!guard.ok) return guard.response;

  const plans = getAllPlansConfig();
  return okResponse(plans, guard.requestId);
}
