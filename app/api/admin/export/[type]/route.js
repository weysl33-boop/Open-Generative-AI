import { withAdminErrorBoundary, requirePermission, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.exportsRead);
  if (!guard.ok) return guard.response;
  return errorResponse('GONE', '同步导出接口已停用，请先创建异步导出任务', 410, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
