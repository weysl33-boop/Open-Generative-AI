import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency } from '@/lib/admin/idempotency';
import { retryGenerationTask } from '@/lib/services/generations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.generationsWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = request.headers.get('idempotency-key');

  const idemp = await checkIdempotency({
    scope: 'generation_retry',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '任务重试正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await retryGenerationTask({
    actor: guard.user,
    creationId: id,
    chargeCredits: Boolean(body.chargeCredits),
    requestId: guard.requestId,
  });

  if (result.error) {
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}
