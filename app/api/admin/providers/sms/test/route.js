import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getClientIp } from '@/lib/security/requestGuard';
import { sendSmsProviderTest } from '@/lib/smsAdmin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '测试短信必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'sms_provider_test_send', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '测试短信正在处理中', 409, guard.requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '测试短信参数无效', 400, guard.requestId);
  }
  const result = await sendSmsProviderTest({
    actor: guard.user,
    provider: body.provider,
    phone: body.phone,
    ip: getClientIp(request),
    requestId: guard.requestId,
  });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse(result.status === 429 ? 'RATE_LIMITED' : 'VALIDATION_ERROR', result.error, result.status || 422, guard.requestId);
  }
  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
