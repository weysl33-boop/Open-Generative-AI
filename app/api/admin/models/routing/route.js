import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import {
  listProviderModelsByModelId,
  getRoutingPolicy,
  upsertRoutingPolicy,
  upsertProviderModel,
  deleteProviderModel,
  getCanonicalModelById,
  listProviders,
  listCanonicalModels,
} from '@/lib/repositories/aiCatalog';
import { logAudit } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const modelId = searchParams.get('modelId');

  if (!modelId) {
    // 列出所有规范模型及其关联渠道数量
    const models = await listCanonicalModels();
    const providers = await listProviders();
    return okResponse({ models, providers }, guard.requestId);
  }

  const [canonicalModel, providerModels, routingPolicy, providers] = await Promise.all([
    getCanonicalModelById(modelId),
    listProviderModelsByModelId(modelId),
    getRoutingPolicy(modelId),
    listProviders(),
  ]);

  return okResponse({
    canonicalModel,
    providerModels,
    routingPolicy: routingPolicy || {
      model_id: modelId,
      routing_mode: 'balanced',
      weights: { cost: 0.4, success_rate: 0.3, speed: 0.2, capacity: 0.1 },
      circuit_breaker_config: { failure_threshold: 3, cooling_period_sec: 60 },
      failover_enabled: true,
    },
    availableProviders: providers,
  }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const { type = 'provider_model', data } = body;

  if (type === 'policy') {
    if (!data?.model_id) {
      return errorResponse('VALIDATION_ERROR', 'model_id 为必填项', 422, guard.requestId);
    }
    const updatedPolicy = await upsertRoutingPolicy(data);
    await logAudit({
      actor: guard.user,
      action: 'models.routing_policy_update',
      targetType: 'routing_policy',
      targetId: data.model_id,
      riskLevel: 'medium',
      after: updatedPolicy,
    });
    return okResponse({ routingPolicy: updatedPolicy }, guard.requestId);
  }

  if (!data?.model_id || !data?.provider_id) {
    return errorResponse('VALIDATION_ERROR', 'model_id 与 provider_id 均为必填项', 422, guard.requestId);
  }

  const updatedChannel = await upsertProviderModel(data);
  await logAudit({
    actor: guard.user,
    action: 'models.channel_mapping_upsert',
    targetType: 'provider_model',
    targetId: updatedChannel.id,
    riskLevel: 'medium',
    after: updatedChannel,
  });

  return okResponse({ providerModel: updatedChannel }, guard.requestId);
}

async function handleDELETE(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) {
    return errorResponse('VALIDATION_ERROR', '请指定要删除的渠道映射 ID', 422, guard.requestId);
  }

  await deleteProviderModel(id);
  await logAudit({
    actor: guard.user,
    action: 'models.channel_mapping_delete',
    targetType: 'provider_model',
    targetId: id,
    riskLevel: 'medium',
  });

  return okResponse({ success: true, id }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
export const DELETE = withAdminErrorBoundary(handleDELETE);
