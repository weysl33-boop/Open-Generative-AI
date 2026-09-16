import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listCreditLedger } from '@/lib/repositories/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = requirePermission(request, PERMISSIONS.creditsRead);
  if (!guard.ok) return guard.response;

  const result = listCreditLedger(request.nextUrl.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}
