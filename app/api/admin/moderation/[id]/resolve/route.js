import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency } from '@/lib/admin/idempotency';
import { resolveModeration } from '@/lib/services/moderation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.moderationWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = request.headers.get('idempotency-key');

  const idemp = await checkIdempotency({
    scope: 'moderation_resolve',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '审核处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await resolveModeration({
    actor: guard.user,
    caseId: id,
    resolution: body.resolution,
    notes: body.notes,
    requestId: guard.requestId,
  });

  if (result.error) {
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}
