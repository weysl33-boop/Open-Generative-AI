import { withAdminErrorBoundary, requirePermission, okResponse, resultErrorResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { retryGenerationTask } from '@/lib/services/generations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.generationsWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '缺少有效的 idempotency-key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({
    scope: 'generation_retry',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '任务重试正在处理中', 409, guard.requestId);
  }

  const result = await retryGenerationTask({
    actor: guard.user,
    creationId: id,
    requestId: guard.requestId,
    idempotencyKey,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
