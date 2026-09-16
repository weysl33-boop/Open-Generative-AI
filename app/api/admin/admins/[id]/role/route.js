import { requirePermission, okResponse, errorResponse, verifyAdminPassword } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency } from '@/lib/admin/idempotency';
import { setUserRole } from '@/lib/services/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request, context) {
  const guard = requirePermission(request, PERMISSIONS.adminsWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = request.headers.get('idempotency-key');

  const idemp = checkIdempotency({
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
  if (!verifyAdminPassword(guard.user.id, body.adminPassword)) {
    return errorResponse('UNAUTHORIZED', '管理员密码二次验证失败，拒绝执行', 403, guard.requestId);
  }

  const result = setUserRole({
    actor: guard.user,
    userId: id,
    role: body.role,
    requestId: guard.requestId,
  });

  if (result.error) {
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}
