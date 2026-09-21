import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { runSmsProviderHealthCheck } from '@/lib/smsAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '健康检查必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'sms_provider_health', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '健康检查正在处理中', 409, guard.requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', 'Provider 参数无效', 400, guard.requestId);
  }
  const result = await runSmsProviderHealthCheck({ actor: guard.user, provider: body.provider, requestId: guard.requestId });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', result.error, 422, guard.requestId);
  }
  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
