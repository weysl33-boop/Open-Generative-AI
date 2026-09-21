import { withAdminErrorBoundary, requirePermission, okResponse, errorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import {
  listCanonicalModels,
  listCanonicalPricingRows,
  getModelPricing,
  upsertModelPricing,
} from '@/lib/services/modelCatalog';
import { logAudit } from '@/lib/admin/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handleGET(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsRead);
  if (!guard.ok) return guard.response;

  const [models, pricingList] = await Promise.all([listCanonicalModels(), listCanonicalPricingRows()]);

  const pricingMap = new Map(pricingList.map((p) => [p.model_id, p]));
  const fullList = models.map((m) => {
    const existing = pricingMap.get(m.id);
    return {
      modelId: m.id,
      modelName: m.display_name || m.name,
      category: m.category,
      modelStatus: m.status,
      pricingType: existing?.pricing_type || 'fixed',
      baseCredits: Number(existing?.base_credits ?? 100),
      formulaConfig: existing?.formula_config || {},
      subscriptionDiscounts: existing?.subscription_discounts || {},
      minCredits: Number(existing?.min_credits ?? 10),
      minGrossMarginRate: Number(existing?.min_gross_margin_rate ?? 0.30),
      isActive: existing?.is_active !== false,
      updatedAt: existing?.updated_at || m.updated_at,
    };
  });

  return okResponse({ pricing: fullList }, guard.requestId);
}

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.modelsWrite);
  if (!guard.ok) return guard.response;

  const body = await request.json().catch(() => ({}));
  if (!body.modelId && !body.model_id) {
    return errorResponse('VALIDATION_ERROR', 'modelId 为必填项', 422, guard.requestId);
  }

  const modelId = body.modelId || body.model_id;
  const before = await getModelPricing(modelId);

  const updated = await upsertModelPricing({
    model_id: modelId,
    pricing_type: body.pricingType || body.pricing_type || 'fixed',
    base_credits: Number(body.baseCredits ?? body.base_credits ?? 100),
    formula_config: body.formulaConfig || body.formula_config || {},
    subscription_discounts: body.subscriptionDiscounts || body.subscription_discounts || {},
    min_credits: Number(body.minCredits ?? body.min_credits ?? 10),
    min_gross_margin_rate: Number(body.minGrossMarginRate ?? body.min_gross_margin_rate ?? 0.30),
    is_active: body.isActive !== false && body.is_active !== false,
  });

  await logAudit({
    actor: guard.user,
    action: 'models.pricing_update',
    targetType: 'model_pricing',
    targetId: modelId,
    riskLevel: 'high',
    before,
    after: updated,
  });

  return okResponse({ pricing: updated }, guard.requestId);
}

export const GET = withAdminErrorBoundary(handleGET);
export const POST = withAdminErrorBoundary(handlePOST);
