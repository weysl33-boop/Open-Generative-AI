import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listCanonicalModels } from '@/lib/repositories/aiCatalog';
import CatalogManagerClient from './CatalogManagerClient';

export const dynamic = 'force-dynamic';

export default async function ModelCatalogAdminPage() {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);

  const rawModels = await listCanonicalModels();
  const models = JSON.parse(JSON.stringify(rawModels));

  return (
    <>
      <PageHeader
        eyebrow="模型中台"
        title="规范模型目录"
        description="管理平台对外暴露的标准模型实体（Canonical Models）。前台用户仅能选择规范模型，系统通过智能路由将其动态映射到底层可用渠道。"
      />
      <CatalogManagerClient initialModels={models} />
    </>
  );
}
