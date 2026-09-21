import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getUserDetailFull, setUserStatus } from '@/lib/services/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const detail = await getUserDetailFull(id);
  if (!detail) {
    return errorResponse('NOT_FOUND', '用户不存在', 404, guard.requestId);
  }

  return okResponse(detail, guard.requestId);
}

async function handlePATCH(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.usersUpdate);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'user_status_update', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '用户状态更新正在处理中', 409, guard.requestId);
  }

  const { id } = await context.params;
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await setUserStatus({
    actor: guard.user,
    userId: id,
    status: body.status,
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result.user);
  return okResponse(result.user, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const PATCH = withAdminErrorBoundary(handlePATCH);
