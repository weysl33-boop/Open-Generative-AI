import { requirePermission, okResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listModerationCases } from '@/lib/repositories/moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = await requirePermission(request, PERMISSIONS.moderationRead);
  if (!guard.ok) return guard.response;

  const result = listModerationCases(request.nextUrl.searchParams);
  return okResponse(result.rows, guard.requestId, result.meta);
}
