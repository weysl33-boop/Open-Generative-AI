import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { updateModel } from '@/lib/services/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite || PERMISSIONS.systemSettingsWrite);
  if (!guard.ok) return guard.response;

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
    },
    requestId: guard.requestId,
  });

  if (result.error) {
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  return okResponse(result.model, guard.requestId);
}
