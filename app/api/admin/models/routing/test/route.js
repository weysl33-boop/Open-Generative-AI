import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getProviderAdapter } from '@/lib/adapters/index';
import { getProviderModelById } from '@/lib/repositories/aiCatalog';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const channelId = body.channelId || body.channel_id;

  if (!channelId) {
    return errorResponse('VALIDATION_ERROR', '请指定要测试的渠道 ID (channelId)', 422, guard.requestId);
  }

  const channel = await getProviderModelById(channelId);
  if (!channel) {
    return errorResponse('NOT_FOUND', '未找到对应的供应商模型渠道', 404, guard.requestId);
  }

  const start = Date.now();
  try {
    const adapter = await getProviderAdapter(channel.provider_id);
    const healthResult = await adapter.healthCheck();
    const latencyMs = Date.now() - start;

    return okResponse({
      success: true,
      channelId,
      providerId: channel.provider_id,
      providerModelId: channel.provider_model_id,
      latencyMs,
      message: `渠道测试成功 (${healthResult.status || 'OK'})`,
      details: healthResult,
    }, guard.requestId);
  } catch (error) {
    const latencyMs = Date.now() - start;
    return okResponse({
      success: false,
      channelId,
      providerId: channel.provider_id,
      providerModelId: channel.provider_model_id,
      latencyMs,
      message: error.message || '渠道探测请求失败',
      errorCode: error.code || 'CHANNEL_PROBE_ERROR',
    }, guard.requestId);
  }
}

export const POST = withAdminErrorBoundary(handlePOST);
