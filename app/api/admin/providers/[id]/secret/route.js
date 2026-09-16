import { requirePermission, okResponse, errorResponse, verifyAdminPassword } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency } from '@/lib/admin/idempotency';
import { rotateProviderSecret } from '@/lib/services/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request, context) {
  const guard = requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = request.headers.get('idempotency-key');

  const idemp = checkIdempotency({
    scope: 'provider_secret_rotate',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '密钥轮换处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  // 二次密码校验
  if (!verifyAdminPassword(guard.user.id, body.adminPassword)) {
    return errorResponse('UNAUTHORIZED', '管理员密码二次验证失败，拒绝轮换密钥', 403, guard.requestId);
  }

  const result = rotateProviderSecret({
    actor: guard.user,
    provider: id,
    secretName: body.secretName || 'api_key',
    secretValue: body.secretValue,
    requestId: guard.requestId,
  });

  if (result.error) {
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}
