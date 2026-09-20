import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getCostCenterAnalytics } from '@/lib/services/analyticsFinancial';
import { listProviders, listCanonicalModels } from '@/lib/repositories/aiCatalog';
import CostCenterClient from './CostCenterClient';

export const dynamic = 'force-dynamic';

export default async function CostCenterPage() {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);

  const [initialData, providers, models] = await Promise.all([
    getCostCenterAnalytics(),
    listProviders(),
    listCanonicalModels(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="财务与运营"
        title="成本中心 (Cost Center)"
        description="核算底层物理供应商的真实 API 支出账目。精准统计各通道调用次数、调用成功率、网络耗时与真实美金/人民币成本消耗。"
      />
      <CostCenterClient
        initialData={JSON.parse(JSON.stringify(initialData))}
        providers={JSON.parse(JSON.stringify(providers))}
        models={JSON.parse(JSON.stringify(models))}
      />
    </>
  );
}
