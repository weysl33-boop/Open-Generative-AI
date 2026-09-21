import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { processOrderRefund } from '@/lib/services/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.billingWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '退款必须提供有效的 Idempotency-Key', 422, guard.requestId);

  const idemp = await checkIdempotency({
    scope: 'order_refund',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '退款操作正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await processOrderRefund({
    actor: guard.user,
    orderId: id,
    reason: body.reason,
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
