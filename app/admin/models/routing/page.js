import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listCanonicalModels, listProviders } from '@/lib/services/modelCatalog';
import RoutingManagerClient from './RoutingManagerClient';

export const dynamic = 'force-dynamic';

export default async function ModelRoutingAdminPage() {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);

  const [rawModels, rawProviders] = await Promise.all([
    listCanonicalModels(),
    listProviders(),
  ]);

  const models = JSON.parse(JSON.stringify(rawModels));
  const providers = JSON.parse(JSON.stringify(rawProviders));

  return (
    <>
      <PageHeader
        eyebrow="智能中台"
        title="路由策略配置"
        description="维护规范模型与底层物理供应商渠道的映射与调度规则。支持配置路由模式（成本/质量/稳定/平衡）、权重与优先级。系统严格在同模型各渠道间进行故障转移，禁止跨模型降级。"
      />
      <RoutingManagerClient initialModels={models} initialProviders={providers} />
    </>
  );
}
