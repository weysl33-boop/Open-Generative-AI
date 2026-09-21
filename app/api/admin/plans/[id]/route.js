import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { updatePlanDetails } from '@/lib/services/billing';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePATCH(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.plansWrite);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'plan_update', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '套餐更新正在处理中', 409, guard.requestId);
  }

  const { id } = await context.params;
  let body = {};
  try {
    body = await request.json();
  } catch {}

  const result = await updatePlanDetails({
    actor: guard.user,
    planId: id,
    name: body.name,
    monthlyCny: body.monthlyCny,
    monthlyUsd: body.monthlyUsd,
    yearlyCny: body.yearlyCny,
    yearlyUsd: body.yearlyUsd,
    quotaBase: body.quotaBase,
    quotaBonus: body.quotaBonus,
    concurrency: body.concurrency,
    asyncConcurrency: body.asyncConcurrency,
    portraitCapacity: body.portraitCapacity,
    badge: body.badge,
    meta: body.meta,
    features: body.features,
    displayOrder: body.displayOrder,
    enabled: body.enabled,
    requestId: guard.requestId,
  });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  await completeIdempotency(idemp.keyHash, result.plan);
  return okResponse(result.plan, guard.requestId);
}

export const PATCH = withAdminErrorBoundary(handlePATCH);
