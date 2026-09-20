import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listProviders, getProviderById, updateProvider, createProvider, deleteProvider } from '@/lib/repositories/aiCatalog';
import { saveProviderSecret, getProviderSecretsMetadata } from '@/lib/repositories/providers';
import { logAudit } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersRead);
  if (!guard.ok) return guard.response;

  const providers = await listProviders();
  const enriched = await Promise.all(
    providers.map(async (p) => {
      const secrets = await getProviderSecretsMetadata(p.id);
      return {
        ...p,
        hasApiKey: secrets.some((s) => s.name === 'api_key' || s.name === 'apiKey') || Boolean(process.env[`${p.id.toUpperCase()}_API_KEY`]),
        secretsCount: secrets.length,
      };
    })
  );

  return okResponse({ providers: enriched }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  const id = body.id ? String(body.id).trim().toLowerCase() : null;

  if (!id || !body.name) {
    return errorResponse('VALIDATION_ERROR', '供应商 ID 与名称为必填项', 422, guard.requestId);
  }

  const existing = await getProviderById(id);
  let saved;

  if (existing) {
    saved = await updateProvider(id, {
      name: body.name,
      provider_type: body.provider_type || body.providerType,
      enabled: body.enabled !== false,
      priority: Number(body.priority ?? 100),
      base_url: body.base_url || body.baseUrl,
      api_mode: body.api_mode || body.apiMode,
      balance: body.balance !== undefined ? Number(body.balance) : existing.balance,
      currency: body.currency || existing.currency,
      metadata: body.metadata,
    });
  } else {
    saved = await createProvider({
      id,
      slug: body.slug || id,
      name: body.name,
      provider_type: body.provider_type || body.providerType || 'aggregator',
      enabled: body.enabled !== false,
      priority: Number(body.priority ?? 100),
      base_url: body.base_url || body.baseUrl || '',
      api_mode: body.api_mode || body.apiMode || 'async_poll',
      balance: Number(body.balance || 0),
      currency: body.currency || 'USD',
      metadata: body.metadata || {},
    });
  }

  // 若提交了新的 API 密钥，安全加密存储
  if (body.apiKey && String(body.apiKey).trim()) {
    await saveProviderSecret({
      provider: id,
      name: 'api_key',
      secretValue: String(body.apiKey).trim(),
    });
  }

  await logAudit({
    actor: guard.user,
    action: existing ? 'providers.update' : 'providers.create',
    targetType: 'ai_provider',
    targetId: id,
    riskLevel: 'high',
    before: existing,
    after: saved,
  });

  return okResponse({ provider: saved }, guard.requestId);
}

async function handleDELETE(request) {
  const guard = await requirePermission(request, PERMISSIONS.providersWrite);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return errorResponse('VALIDATION_ERROR', '请指定要删除的供应商 ID', 422, guard.requestId);
  }

  await deleteProvider(id);
  await logAudit({
    actor: guard.user,
    action: 'providers.delete',
    targetType: 'ai_provider',
    targetId: id,
    riskLevel: 'high',
  });

  return okResponse({ success: true, id }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
export const DELETE = withAdminErrorBoundary(handleDELETE);
