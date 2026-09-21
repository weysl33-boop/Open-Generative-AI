import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { updateModel } from '@/lib/services/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePATCH(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'model_update', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '模型配置更新正在处理中', 409, guard.requestId);
  }

  const { id } = await context.params;
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await updateModel({
    actor: guard.user,
    id,
    updates: {
      name: body.name,
      cost_usd: body.cost_usd,
      credits_price: body.credits_price,
      is_active: body.is_active,
      sort_order: body.sort_order,
      provider: body.provider,
      routing_mode: body.routing_mode,
    },
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
