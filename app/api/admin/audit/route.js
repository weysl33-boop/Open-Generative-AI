import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { queryAuditLogs } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = requirePermission(request, PERMISSIONS.auditRead);
  if (!guard.ok) return guard.response;

  const result = queryAuditLogs(request.nextUrl.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}
