import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { setPrimaryProvider } from '@/lib/services/modelRouting';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * 切换模型的默认供应商渠道。高风险写：必须带 Idempotency-Key，
 * 与 PATCH /api/admin/models/[id] 同一套防重放约定。
 */
async function handlePATCH(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'model_provider_switch', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '默认供应商切换正在处理中', 409, guard.requestId);
  }

  const { id } = await context.params;
  const body = await request.json().catch(() => ({}));
  const channelId = body.channelId || body.channel_id;

  const result = await setPrimaryProvider({
    actor: guard.user,
    modelId: id,
    channelId,
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result.model);
  return okResponse(result.model, guard.requestId);
}

export const PATCH = withAdminErrorBoundary(handlePATCH);
