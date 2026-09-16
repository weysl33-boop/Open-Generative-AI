import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { logAudit } from '@/lib/admin/audit';
import { getDatabase, nowIso } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, context) {
  const guard = requirePermission(request, PERMISSIONS.webhooksReplay);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const db = getDatabase();

  const event = db.prepare('SELECT * FROM webhook_events WHERE event_id = ?').get(id);
  if (!event) {
    return errorResponse('NOT_FOUND', 'Webhook 事件记录不存在', 404, guard.requestId);
  }

  let replayDetail = 'attempts_incremented';
  let replayError = null;

  // 若存在持久化的原始报文载荷，真正调用派发器执行业务重放
  if (event.payload_json) {
    try {
      const payload = JSON.parse(event.payload_json);
      const { dispatchStripeEvent } = await import('@/lib/services/webhookDispatcher');
      const result = dispatchStripeEvent(payload);
      if (result.success) {
        replayDetail = result.action || 'dispatched';
      } else {
        replayError = result.error;
      }
    } catch (parseErr) {
      replayError = parseErr.message;
    }
  }

  const nextStatus = replayError ? 'replay_failed' : 'replayed';

  // 更新状态与重试次数
  db.prepare(`
    UPDATE webhook_events
    SET attempts = attempts + 1, status = ?, last_error = ?, processed_at = ?
    WHERE event_id = ?
  `).run(nextStatus, replayError, nowIso(), id);

  logAudit({
    actor: guard.user,
    action: 'webhooks.replay',
    targetType: 'webhook_event',
    targetId: id,
    riskLevel: 'medium',
    before: { attempts: event.attempts, status: event.status },
    after: { attempts: event.attempts + 1, status: nextStatus, replayDetail, replayError },
    requestId: guard.requestId,
  });

  return okResponse({ eventId: id, status: nextStatus, detail: replayDetail, error: replayError }, guard.requestId);
}
