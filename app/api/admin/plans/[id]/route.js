import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { updatePlanDetails } from '@/lib/services/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PATCH(request, context) {
  const guard = requirePermission(request, PERMISSIONS.plansWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = updatePlanDetails({
    actor: guard.user,
    planId: id,
    name: body.name,
    monthlyCny: body.monthlyCny,
    monthlyUsd: body.monthlyUsd,
    features: body.features,
    displayOrder: body.displayOrder,
    enabled: body.enabled,
    requestId: guard.requestId,
  });

  if (result.error) {
    return errorResponse('BAD_REQUEST', result.error, 400, guard.requestId);
  }

  return okResponse(result.plan, guard.requestId);
}
