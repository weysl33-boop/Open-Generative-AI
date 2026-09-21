import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getMotionConfig, saveMotionConfig } from '@/lib/services/content';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentRead);
  if (!guard.ok) return guard.response;

  const motion = await getMotionConfig();
  return okResponse(motion, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({
    scope: 'content_motion_update',
    key: idempotencyKey,
    actorId: guard.user.id,
  });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '动效配置更新正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await saveMotionConfig({
    actor: guard.user,
    config: body,
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result.motion);
  return okResponse(result.motion, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
