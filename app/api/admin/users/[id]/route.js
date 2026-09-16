import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getUserDetailFull, setUserStatus } from '@/lib/services/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.usersRead);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const detail = await getUserDetailFull(id);
  if (!detail) {
    return errorResponse('NOT_FOUND', '用户不存在', 404, guard.requestId);
  }

  return okResponse(detail, guard.requestId);
}

export async function PATCH(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.usersUpdate);
  if (!guard.ok) return guard.response;

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
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  return okResponse(result.user, guard.requestId);
}
