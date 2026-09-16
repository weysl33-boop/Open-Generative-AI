import { requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listCoupons, createCouponsBatch } from '@/lib/services/coupons';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const guard = requirePermission(request, PERMISSIONS.creditsRead);
  if (!guard.ok) return guard.response;

  const result = listCoupons(request.nextUrl.searchParams);
  return okResponse(result, guard.requestId);
}

export async function POST(request) {
  const guard = requirePermission(request, PERMISSIONS.creditsAdjust || PERMISSIONS.billingWrite);
  if (!guard.ok) return guard.response;

  try {
    const body = await request.json();
    const result = createCouponsBatch({
      count: body.count || 1,
      type: body.type || 'credits',
      value: body.value || '50',
      maxUses: body.maxUses || 1,
      expiresAt: body.expiresAt || null,
      actor: guard.user,
      requestId: guard.requestId,
    });

    return okResponse(result, guard.requestId);
  } catch (error) {
    console.error('[admin/coupons/create]', error);
    return errorResponse('INTERNAL_ERROR', error.message, 500, guard.requestId);
  }
}
