import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { getSettingByKey, saveSystemSetting } from '@/lib/services/settings';
import { SOCIAL_LOGIN_SETTING_KEY, getSocialLoginProviders, sanitizeSocialLoginConfig } from '@/lib/auth/socialProviders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;
  const stored = await getSettingByKey(SOCIAL_LOGIN_SETTING_KEY);
  return okResponse({ config: sanitizeSocialLoginConfig(stored?.value ?? stored) }, guard.requestId);
}

async function handlePUT(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;
  const key = getRequiredIdempotencyKey(request);
  if (!key) return errorResponse('VALIDATION_ERROR', '登录分区配置必须提供 Idempotency-Key', 422, guard.requestId);
  const idemp = await checkIdempotency({ scope: 'social_login_regions', key, actorId: guard.user.id });
  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '登录分区配置正在处理中', 409, guard.requestId);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '登录分区配置格式无效', 400, guard.requestId);
  }

  const submitted = body?.config;
  // sanitize 会补齐缺失渠道，所以"保存成功"的内容必须与提交内容一一对应，
  // 否则一次漏传就等于把运营没提到的渠道全部重新打开。
  for (const region of Object.keys(submitted || {})) {
    if (!Array.isArray(submitted[region])) {
      await releaseIdempotency(idemp.keyHash);
      return errorResponse('VALIDATION_ERROR', `分区 ${region} 的渠道列表格式无效`, 422, guard.requestId);
    }
  }
  const config = sanitizeSocialLoginConfig(submitted);
  for (const region of Object.keys(config)) {
    const submittedCount = (submitted?.[region] || []).length;
    if (submittedCount !== config[region].length) {
      await releaseIdempotency(idemp.keyHash);
      return errorResponse('VALIDATION_ERROR', `分区 ${region} 包含未知渠道或重复渠道`, 422, guard.requestId);
    }
  }

  const result = await saveSystemSetting({
    actor: guard.user,
    key: SOCIAL_LOGIN_SETTING_KEY,
    value: config,
    visibility: 'private',
    requestId: guard.requestId,
  });
  if (result.error) {
    await releaseIdempotency(idemp.keyHash);
    return resultErrorResponse(result.error, guard.requestId);
  }

  const payload = {
    config,
    preview: Object.fromEntries(
      Object.keys(config).map((region) => [region, getSocialLoginProviders(region, { config })])
    ),
  };
  await completeIdempotency(idemp.keyHash, payload);
  return okResponse(payload, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const PUT = withAdminErrorBoundary(handlePUT);
