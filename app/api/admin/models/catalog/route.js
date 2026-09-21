import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listCanonicalModels, upsertCanonicalModel, getCanonicalModelById } from '@/lib/services/modelCatalog';
import { logAudit } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || null;
  const models = await listCanonicalModels({ category });

  return okResponse({ models }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  if (!body.id || !body.name) {
    return errorResponse('VALIDATION_ERROR', '模型 ID 与名称为必填项', 422, guard.requestId);
  }

  const before = await getCanonicalModelById(body.id);
  const updated = await upsertCanonicalModel(body);

  await logAudit({
    actor: guard.user,
    action: before ? 'models.canonical_update' : 'models.canonical_create',
    targetType: 'canonical_model',
    targetId: updated.id,
    riskLevel: 'medium',
    before,
    after: updated,
  });

  return okResponse({ model: updated }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
