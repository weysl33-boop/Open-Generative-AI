import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { adjustUserCredits } from '@/lib/services/credits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.creditsAdjust);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '缺少 idempotency-key', 422, guard.requestId);

  const idemp = await checkIdempotency({
    scope: 'credits_adjust',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) {
      return okResponse(idemp.cachedResponse, guard.requestId);
    }
    return errorResponse('CONFLICT', '该调额请求正在处理中，请勿重复提交', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await adjustUserCredits({
    actor: guard.user,
    userId: id,
    delta: body.delta,
    reason: body.reason,
    referenceId: body.referenceId,
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
