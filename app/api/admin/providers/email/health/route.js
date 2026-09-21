import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { runEmailSmtpHealthCheck } from '@/lib/emailAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;
  const key = getRequiredIdempotencyKey(request);
  if (!key) return errorResponse('VALIDATION_ERROR', 'SMTP 健康检查必须提供 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'email_smtp_health', key, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', 'SMTP 健康检查正在处理中', 409, guard.requestId);
  }
  const result = await runEmailSmtpHealthCheck({ actor: guard.user, requestId: guard.requestId });
  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
