import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { replayWebhookEvent } from '@/lib/services/webhookDispatcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.webhooksReplay);
  if (!guard.ok) return guard.response;
  const provider = String(request.nextUrl.searchParams.get('provider') || '').trim().toLowerCase();
  if (!['stripe', 'wechat', 'alipay'].includes(provider)) {
    return errorResponse('VALIDATION_ERROR', '缺少或无效的 provider，无法在不确定的渠道下重放事件', 422, guard.requestId);
  }
  const { id } = await context.params;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'webhook_replay', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', 'Webhook 重放正在处理中', 409, guard.requestId);
  }
  const result = await replayWebhookEvent({ actor: guard.user, eventId: id, requestId: guard.requestId, provider });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    if (result.error === 'NOT_FOUND') return errorResponse('NOT_FOUND', 'Webhook 事件记录不存在', 404, guard.requestId);
    return errorResponse('VALIDATION_ERROR', result.error, 422, guard.requestId);
  }
  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const POST = withAdminErrorBoundary(handlePOST);
