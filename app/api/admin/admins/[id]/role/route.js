import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, verifyAdminPassword } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { setUserRole } from '@/lib/services/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePUT(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.adminsWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '角色变更必须提供有效的 Idempotency-Key', 422, guard.requestId);

  const idemp = await checkIdempotency({
    scope: 'admin_role_change',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '操作正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  // 二次密码校验
  if (!await verifyAdminPassword(guard.user.id, body.adminPassword)) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('UNAUTHORIZED', '管理员密码二次验证失败，拒绝执行', 403, guard.requestId);
  }

  const result = await setUserRole({
    actor: guard.user,
    userId: id,
    role: body.role,
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', result.error, 422, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const PUT = withAdminErrorBoundary(handlePUT);
