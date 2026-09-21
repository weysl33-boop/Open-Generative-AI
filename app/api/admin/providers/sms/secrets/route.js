import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { saveSmsProviderSecrets } from '@/lib/smsAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '密钥保存必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'sms_provider_secret_rotate', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '密钥保存正在处理中', 409, guard.requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '密钥配置格式无效', 400, guard.requestId);
  }
  const result = await saveSmsProviderSecrets({
    actor: guard.user,
    adminPassword: body.adminPassword,
    secrets: body.secrets,
    requestId: guard.requestId,
  });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse(result.error === '管理员密码验证失败' ? 'UNAUTHENTICATED' : 'VALIDATION_ERROR', result.error, result.error === '管理员密码验证失败' ? 401 : 422, guard.requestId);
  }
  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const PUT = withAdminErrorBoundary(handlePUT);
