import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getGenerationTrace } from '@/lib/services/generations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.generationsRead);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const trace = await getGenerationTrace(id);
  if (!trace) return errorResponse('NOT_FOUND', '生成任务不存在', 404, guard.requestId);
  return okResponse(trace, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
