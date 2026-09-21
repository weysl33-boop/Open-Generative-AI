import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { revokeUserSessions } from '@/lib/services/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.sessionsRevoke);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'user_sessions_revoke', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '会话撤销正在处理中', 409, guard.requestId);
  }

  const { id } = await context.params;
  const result = await revokeUserSessions({
    actor: guard.user,
    userId: id,
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
