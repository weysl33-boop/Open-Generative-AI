import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listCanonicalModels, listCanonicalPricingRows } from '@/lib/services/modelCatalog';
import PricingManagerClient from './PricingManagerClient';

export const dynamic = 'force-dynamic';

export default async function ModelPricingAdminPage() {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);

  const [models, pricingList] = await Promise.all([
    listCanonicalModels(),
    listCanonicalPricingRows(),
  ]);

  const pricingMap = new Map(pricingList.map((p) => [p.model_id, p]));
  const pricingData = models.map((m) => {
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

  return (
    <>
      <PageHeader
        eyebrow="财务与计费"
        title="模型定价配置"
        description="管理创作者生成各类规范模型时的 Credits 计费策略。支持固定点数与分辨率/时长动态公式计费，设定最低毛利率红线预警。"
      />
      <PricingManagerClient initialPricing={JSON.parse(JSON.stringify(pricingData))} />
    </>
  );
}
