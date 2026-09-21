import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getProviderModelById } from '@/lib/services/modelCatalog';
import { probeProviderChannel } from '@/lib/services/healthProbe';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
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

  // 探测只有 healthProbe 这一份实现：它负责归一化适配器口径并落库。
  // 这里自己再 adapter.healthCheck() 一次的话，"测试成功"不会在任何地方留下记录，
  // 页面上的健康度与延迟仍是旧值，管理员看到的和刚才那一下点的不是同一件事。
  const result = await probeProviderChannel(channel.provider_id);
  return okResponse(
    { ...result, channelId: channel.id, providerModelId: channel.provider_model_id },
    guard.requestId
  );
}

export const POST = withAdminErrorBoundary(handlePOST);
