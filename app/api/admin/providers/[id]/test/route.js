import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { testProviderHealth } from '@/lib/services/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '供应商健康检查必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'provider_health_check', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '供应商健康检查正在处理中', 409, guard.requestId);
  }

  const { id } = await context.params;
  try {
    const result = await testProviderHealth({
      actor: guard.user,
      provider: id,
      requestId: guard.requestId,
    });
    await completeIdempotency(idemp.keyHash, result);
    return okResponse(result, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    throw error;
  }
}

export const POST = withAdminErrorBoundary(handlePOST);
