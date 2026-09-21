import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getSmsAdminOverview, saveSmsAdminConfiguration } from '@/lib/smsAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;
  return okResponse(await getSmsAdminOverview(), guard.requestId);
}

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', 'SMS 配置必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'sms_provider_config', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', 'SMS 配置正在处理中', 409, guard.requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '配置格式无效', 400, guard.requestId);
  }
  const result = await saveSmsAdminConfiguration({ actor: guard.user, body, requestId: guard.requestId });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', result.error, 422, guard.requestId);
  }

  const payload = await getSmsAdminOverview();
  await completeIdempotency(idemp.keyHash, payload);
  return okResponse(payload, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const PUT = withAdminErrorBoundary(handlePUT);
