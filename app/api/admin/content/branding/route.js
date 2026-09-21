import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import {
  getBrandConfig,
  getNavigationConfig,
  saveBrandConfig,
  saveNavigationConfig,
  resetBrandingToDefault,
  DEFAULT_BRAND_CONFIG,
  DEFAULT_NAV_CONFIG,
} from '@/lib/services/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentRead);
  if (!guard.ok) return guard.response;

  const [brand, navigation] = await Promise.all([
    getBrandConfig(),
    getNavigationConfig(),
  ]);

  return okResponse(
    {
      brand,
      navigation,
      defaults: {
        brand: DEFAULT_BRAND_CONFIG,
        navigation: DEFAULT_NAV_CONFIG,
      },
    },
    guard.requestId
  );
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.contentWrite);
  if (!guard.ok) return guard.response;

  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) {
    return errorResponse('VALIDATION_ERROR', '高风险写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  }

  const idemp = await checkIdempotency({
    scope: 'content_branding_update',
    key: idempotencyKey,
    actorId: guard.user.id,
  });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '品牌与导航设置更新正在处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  // 1. 如果是重置为系统出厂预设动作
  if (body.action === 'reset') {
    const result = await resetBrandingToDefault({
      actor: guard.user,
      requestId: guard.requestId,
    });
    if (result.error) {
      await releaseIdempotency(idemp.keyHash);
      return resultErrorResponse(result.error, guard.requestId);
    }
    await completeIdempotency(idemp.keyHash, result);
    return okResponse(result, guard.requestId);
  }

  // 2. 普通保存动作（支持同时提交 brand 和 navigation）
  let updatedBrand = null;
  let updatedNavigation = null;

  if (body.brand) {
    const brandRes = await saveBrandConfig({
      actor: guard.user,
      config: body.brand,
      requestId: guard.requestId,
    });
    if (brandRes.error) {
      await releaseIdempotency(idemp.keyHash);
      return resultErrorResponse(brandRes.error, guard.requestId);
    }
    updatedBrand = brandRes.data;
  } else {
    updatedBrand = await getBrandConfig();
  }

  if (body.navigation) {
    const navRes = await saveNavigationConfig({
      actor: guard.user,
      items: body.navigation,
      requestId: guard.requestId,
    });
    if (navRes.error) {
      await releaseIdempotency(idemp.keyHash);
      return resultErrorResponse(navRes.error, guard.requestId);
    }
    updatedNavigation = navRes.data;
  } else {
    updatedNavigation = await getNavigationConfig();
  }

  const responsePayload = {
    brand: updatedBrand,
    navigation: updatedNavigation,
  };

  await completeIdempotency(idemp.keyHash, responsePayload);
  return okResponse(responsePayload, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
