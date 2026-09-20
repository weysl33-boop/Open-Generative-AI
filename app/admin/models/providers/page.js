import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { listProviders } from '@/lib/repositories/aiCatalog';
import { getProviderSecretsMetadata } from '@/lib/repositories/providers';
import ProvidersManagerClient from './ProvidersManagerClient';

export const dynamic = 'force-dynamic';

export default async function ProvidersAdminPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);

  const rawProviders = await listProviders();
  const providers = await Promise.all(
    rawProviders.map(async (p) => {
      const secrets = await getProviderSecretsMetadata(p.id);
      return {
        ...JSON.parse(JSON.stringify(p)),
        hasApiKey: secrets.some((s) => s.name === 'api_key' || s.name === 'apiKey') || Boolean(process.env[`${p.id.toUpperCase()}_API_KEY`]),
      };
    })
  );

  return (
    <>
      <PageHeader
        eyebrow="模型与集成"
        title="供应商管理"
        description="管理平台接入的各 AI 供应商驱动。支持统一配置 API Key、Base URL、优先级与健康探针，密钥由 AES-256-GCM 高强度加密入库。"
      />
      <ProvidersManagerClient initialProviders={providers} />
    </>
  );
}
