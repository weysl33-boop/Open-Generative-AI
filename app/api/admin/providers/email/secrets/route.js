import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getEmailSmtpOverview, saveEmailSmtpPassword } from '@/lib/emailAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;
  const key = getRequiredIdempotencyKey(request);
  if (!key) return errorResponse('VALIDATION_ERROR', 'SMTP 密码保存必须提供 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'email_smtp_secret_rotate', key, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', 'SMTP 密码正在处理中', 409, guard.requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', 'SMTP 密码请求格式无效', 400, guard.requestId);
  }
  const result = await saveEmailSmtpPassword({
    actor: guard.user,
    adminPassword: body.adminPassword,
    password: body.password,
    requestId: guard.requestId,
  });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    const unauthorized = result.error === '管理员密码验证失败';
    return errorResponse(unauthorized ? 'UNAUTHENTICATED' : 'VALIDATION_ERROR', result.error, unauthorized ? 401 : 422, guard.requestId);
  }
  const payload = await getEmailSmtpOverview();
  await completeIdempotency(idemp.keyHash, payload);
  return okResponse(payload, guard.requestId);
}

export const PUT = withAdminErrorBoundary(handlePUT);
