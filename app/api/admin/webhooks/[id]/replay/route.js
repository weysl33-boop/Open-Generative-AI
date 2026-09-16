import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { logAudit } from '@/lib/admin/audit';
import { execute, queryOne, nowIso } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.webhooksReplay);
  if (!guard.ok) return guard.response;
  const { id } = await context.params;
  const event = await queryOne('SELECT * FROM webhook_events WHERE event_id = $1 ORDER BY created_at DESC LIMIT 1', [id]);
  if (!event) return errorResponse('NOT_FOUND', 'Webhook 事件记录不存在', 404, guard.requestId);
  let replayDetail = 'attempts_incremented';
  let replayError = null;
  if (event.payload_json) {
    try {
      const payload = typeof event.payload_json === 'string' ? JSON.parse(event.payload_json) : event.payload_json;
      const { dispatchStripeEvent } = await import('@/lib/services/webhookDispatcher');
      const result = await dispatchStripeEvent(payload);
      if (result.success) replayDetail = result.action || 'dispatched'; else replayError = result.error;
    } catch (error) { replayError = error.message; }
  }
  const nextStatus = replayError ? 'replay_failed' : 'replayed';
  await execute('UPDATE webhook_events SET attempts = attempts + 1, status = $1, last_error = $2, processed_at = $3 WHERE provider = $4 AND event_id = $5', [nextStatus, replayError, nowIso(), event.provider, id]);
  await logAudit({ actor: guard.user, action: 'webhooks.replay', targetType: 'webhook_event', targetId: id, riskLevel: 'medium', before: { attempts: event.attempts, status: event.status }, after: { attempts: event.attempts + 1, status: nextStatus, replayDetail, replayError }, requestId: guard.requestId });
  return okResponse({ eventId: id, status: nextStatus, detail: replayDetail, error: replayError }, guard.requestId);
}
