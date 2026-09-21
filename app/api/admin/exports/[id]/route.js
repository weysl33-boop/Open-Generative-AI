import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getExportStatus } from '@/lib/services/exports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.exportsRead);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const job = await getExportStatus(id);
  if (!job) return errorResponse('NOT_FOUND', '导出任务不存在', 404, guard.requestId);
  if (job?.status === 'succeeded') {
    return okResponse({
      jobId: job.id,
      status: job.status,
      type: job.export_type,
      rowCount: null,
      downloadUrl: `/api/admin/exports/${job.id}/download`,
      expiresAt: job.expires_at,
    }, guard.requestId);
  }
  return okResponse({
    jobId: job.id,
    status: job.status,
    type: job.export_type,
    errorCode: job.error_code || null,
    errorMessage: job.error_message || null,
    expiresAt: job.expires_at,
  }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
