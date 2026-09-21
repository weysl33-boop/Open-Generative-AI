import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getEmailSmtpOverview, saveEmailSmtpConfiguration } from '@/lib/emailAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;
  return okResponse(await getEmailSmtpOverview(), guard.requestId);
}

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;
  const key = getRequiredIdempotencyKey(request);
  if (!key) return errorResponse('VALIDATION_ERROR', '邮箱配置必须提供 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'email_smtp_config', key, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '邮箱配置正在处理中', 409, guard.requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '邮箱配置格式无效', 400, guard.requestId);
  }
  const result = await saveEmailSmtpConfiguration({ actor: guard.user, body, requestId: guard.requestId });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', result.error, 422, guard.requestId);
  }
  const payload = await getEmailSmtpOverview();
  await completeIdempotency(idemp.keyHash, payload);
  return okResponse(payload, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const PUT = withAdminErrorBoundary(handlePUT);
