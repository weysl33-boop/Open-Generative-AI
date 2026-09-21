import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getRequiredIdempotencyKey, checkIdempotency, completeIdempotency, releaseIdempotency } from '@/lib/admin/idempotency';
import { getLanguageManagementSnapshot, publishLocale, saveTranslation } from '@/lib/services/i18n';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.i18nRead);
  if (!guard.ok) return guard.response;
  return okResponse(await getLanguageManagementSnapshot(), guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.i18nWrite);
  if (!guard.ok) return guard.response;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '语言管理写操作必须提供有效的 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'i18n_update', key: idempotencyKey, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '语言更新正在处理中', 409, guard.requestId);
  }

  let body = {};
  try { body = await request.json(); } catch {}
  const result = body.action === 'publish-locale'
    ? await publishLocale({ actor: guard.user, locale: body.locale, requestId: guard.requestId })
    : await saveTranslation({
      actor: guard.user,
      locale: body.locale,
      key: body.key,
      value: body.value,
      action: body.action === 'publish' ? 'publish' : 'draft',
      requestId: guard.requestId,
    });

  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }
  await completeIdempotency(idemp.keyHash, result);
  return okResponse(result, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
