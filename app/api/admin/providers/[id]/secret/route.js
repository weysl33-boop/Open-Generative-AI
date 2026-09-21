import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { checkIdempotency, completeIdempotency, getRequiredIdempotencyKey, releaseIdempotency } from '@/lib/admin/idempotency';
import { rotateProviderSecret, testProviderHealth } from '@/lib/services/providers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePUT(request, context) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const { id } = await context.params;
  const idempotencyKey = getRequiredIdempotencyKey(request);
  if (!idempotencyKey) return errorResponse('VALIDATION_ERROR', '密钥配置必须提供有效的 Idempotency-Key', 422, guard.requestId);

  const idemp = await checkIdempotency({
    scope: 'provider_secret_rotate',
    key: idempotencyKey,
    actorId: guard.user.id,
  });

  if (!idemp.allowed) {
    if (idemp.cachedResponse) return okResponse(idemp.cachedResponse, guard.requestId);
    return errorResponse('CONFLICT', '密钥配置处理中', 409, guard.requestId);
  }

  let body = {};
  try {
    body = await request.json();
  } catch {}

  // 支持 secrets 键值对象或单个 secretName
  const secretsToUpdate = [];
  if (body.secrets && typeof body.secrets === 'object') {
    for (const [k, v] of Object.entries(body.secrets)) {
      if (typeof v === 'string' && v.trim()) {
        secretsToUpdate.push({ name: k, value: v.trim() });
      }
    }
  } else if (body.secretValue) {
    secretsToUpdate.push({ name: body.secretName || 'api_key', value: body.secretValue });
  }

  if (secretsToUpdate.length === 0) {
    await releaseIdempotency(idemp.keyHash);
    return errorResponse('VALIDATION_ERROR', '未提供任何有效密钥内容', 422, guard.requestId);
  }

  const results = [];
  try {
    for (const item of secretsToUpdate) {
      const res = await rotateProviderSecret({
        actor: guard.user,
        provider: id,
        secretName: item.name,
        secretValue: item.value,
        requestId: guard.requestId,
      });
      if (res.error) {
        await releaseIdempotency(idemp.keyHash);
        return errorResponse('VALIDATION_ERROR', `${item.name}: ${res.error}`, 422, guard.requestId);
      }
      results.push(res);
    }
  } catch (err) {
    await releaseIdempotency(idemp.keyHash);
    console.error(`[rotateProviderSecret] 写入 ${id} 失败:`, err);
    return errorResponse('INTERNAL_ERROR', `密钥安全加密存盘失败: ${err.message}`, 500, guard.requestId);
  }

  let latestCheck = null;
  try {
    latestCheck = await testProviderHealth({
      actor: guard.user,
      provider: id,
      requestId: guard.requestId,
    });
  } catch (probeErr) {
    console.warn(`[rotateProviderSecret] 存盘后自动探测 ${id} 异常:`, probeErr.message);
  }

  const responsePayload = {
    success: true,
    count: results.length,
    provider: id,
    latestCheck,
  };

  await completeIdempotency(idemp.keyHash, responsePayload);
  return okResponse(responsePayload, guard.requestId);
}

export const PUT = withAdminErrorBoundary(handlePUT);
