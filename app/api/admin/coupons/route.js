import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { listCoupons, createCouponsBatch } from '@/lib/services/coupons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.couponsRead);
  if (!guard.ok) return guard.response;

  const result = await listCoupons(request.nextUrl.searchParams);
  return okResponse(result, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.couponsWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'coupons_batch_create', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '优惠券批量创建正在处理中', 409, guard.requestId);
  }

  try {
    const body = await request.json();
    const result = await createCouponsBatch({
      count: body.count || 1,
      type: body.type || 'credits',
      value: body.value || '50',
      maxUses: body.maxUses || 1,
      expiresAt: body.expiresAt || null,
      actor: guard.user,
      requestId: guard.requestId,
    });

    await completeIdempotency(idemp.keyHash, result);
    return okResponse(result, guard.requestId);
  } catch (error) {
    await releaseIdempotency(idemp.keyHash);
    console.error('[admin/coupons/create]', error);
    return errorResponse('INTERNAL_ERROR', '优惠券操作暂时不可用，请稍后重试', 500, guard.requestId);
  }
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
