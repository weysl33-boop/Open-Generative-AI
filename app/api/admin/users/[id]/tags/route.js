import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { manageUserTag } from '@/lib/services/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.usersUpdate);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const tagId = String(body.tagId || '').trim();
  const action = body.action === 'remove' ? 'remove' : 'add';

  if (!tagId) {
    return errorResponse('BAD_REQUEST', '缺少 tagId 参数', 400, guard.requestId);
  }

  const result = await manageUserTag({
    actor: guard.user,
    userId: id,
    tagId,
    action,
    requestId: guard.requestId,
  });

  if (result.error) {
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  return okResponse(result.user, guard.requestId);
}
