import { withAdminErrorBoundary, requirePermission, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { logAudit } from '@/lib/admin/audit';
import { getDownloadableExport } from '@/lib/services/exports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.exportsRead);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const job = await getDownloadableExport(id);
  if (!job) return errorResponse('GONE', '导出任务不存在、未完成或已过期', 410, guard.requestId);

  await logAudit({
    actor: guard.user,
    action: 'exports.downloaded',
    targetType: 'export_job',
    targetId: job.id,
    riskLevel: 'medium',
    after: { type: job.export_type, contentSha256: job.content_sha256, expiresAt: job.expires_at },
    requestId: guard.requestId,
  });
  return new Response(job.content_text, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${job.file_name || `export_${job.export_type}.csv`}"`,
      'Cache-Control': 'private, no-store',
      'X-Request-Id': guard.requestId,
    },
  });
}

export const GET = withAdminErrorBoundary(handleGET);
