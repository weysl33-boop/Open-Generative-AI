import { getProvidersOverview } from '@/lib/services/providers';
import { PageHeader } from '@/components/admin/AdminUi';
import ProviderCard from '../ProviderCard';

export default async function AiProvidersPage() {
  const allProviders = await getProvidersOverview();
  const aiProviders = allProviders.filter((p) => p.kind === 'ai');

  return (
    <>
      <PageHeader
        eyebrow="模型与集成"
        title="AI 供应商"
        description="查看 AI 大模型后端驱动（MuAPI、本地模型服务等）配置健康状态。支持一键心跳探针与写入式安全密钥轮换。"
      />

      <div className="grid gap-6 md:grid-cols-2">
        {aiProviders.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </>
  );
}
