import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getProfitCenterAnalytics } from '@/lib/services/analyticsFinancial';
import { listCanonicalModels } from '@/lib/repositories/aiCatalog';
import ProfitCenterClient from './ProfitCenterClient';

export const dynamic = 'force-dynamic';

export default async function ProfitCenterPage() {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);

  const [initialData, models] = await Promise.all([
    getProfitCenterAnalytics(),
    listCanonicalModels(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="财务与运营"
        title="利润中心 (Profit Center)"
        description="核算 AI 生成业务的商业回报率。对比用户 Credits 消耗折算营收与上游 API 物理成本，自动识别亏损或低毛利模型，辅助运营策略调优。"
      />
      <ProfitCenterClient
        initialData={JSON.parse(JSON.stringify(initialData))}
        models={JSON.parse(JSON.stringify(models))}
      />
    </>
  );
}
