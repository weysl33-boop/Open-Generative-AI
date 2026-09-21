import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getExportDefinition, requestExport } from '@/lib/services/exports';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.exportsWrite);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '导出请求必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'admin_export_request', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '导出请求正在处理中', 409, guard.requestId);
  }

  let body = {};
  try { body = await request.json(); } catch {}
  if (!getExportDefinition(body.type)) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '不支持的导出数据类型', 422, guard.requestId);
  }
  const result = await requestExport({ actor: guard.user, type: body.type, filters: body.filters, requestId: guard.requestId });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', result.error, 422, guard.requestId);
  }
  const response = {
    jobId: result.job.id,
    status: result.job.status,
    statusUrl: `/api/admin/exports/${result.job.id}`,
    expiresAt: result.job.expires_at,
  };
  await completeIdempotency(idemp.keyHash, response);
  return new Response(JSON.stringify({ data: response, requestId: guard.requestId }), {
    status: 202,
    headers: { 'Content-Type': 'application/json', 'X-Request-Id': guard.requestId },
  });
}

export const POST = withAdminErrorBoundary(handlePOST);
