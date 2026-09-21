import { withAdminErrorBoundary, requirePermission, okResponse, resultErrorResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { manageUserTag } from '@/lib/services/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.usersUpdate);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'user_tag_update', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '用户标签更新正在处理中', 409, guard.requestId);
  }

  const { id } = await context.params;
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const tagId = String(body.tagId || '').trim();
  const action = body.action === 'remove' ? 'remove' : 'add';

  if (!tagId) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '缺少 tagId 参数', 422, guard.requestId);
  }

  const result = await manageUserTag({
    actor: guard.user,
    userId: id,
    tagId,
    action,
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result.user);
  return okResponse(result.user, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
