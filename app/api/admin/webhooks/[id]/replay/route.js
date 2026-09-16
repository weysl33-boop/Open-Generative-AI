import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { replayWebhookEvent } from '@/lib/services/webhookDispatcher';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.webhooksReplay);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const result = await replayWebhookEvent({ actor: guard.user, eventId: id, requestId: guard.requestId });
  if (result.error === 'NOT_FOUND') return errorResponse('NOT_FOUND', 'Webhook 事件记录不存在', 404, guard.requestId);
  return okResponse(result, guard.requestId);
}
