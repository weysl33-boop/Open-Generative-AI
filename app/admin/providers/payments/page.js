import { getProvidersOverview } from '@/lib/services/providers';
import { PageHeader } from '@/components/admin/AdminUi';
import ProviderCard from '../ProviderCard';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export default async function PaymentProvidersPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  const allProviders = await getProvidersOverview();
  const paymentProviders = allProviders.filter((p) => p.kind === 'payment');

  return (
    <>
      <PageHeader
        eyebrow="模型与集成"
        title="支付渠道"
        description="管理微信支付、支付宝及 Stripe 网关配置可用性与回调健康。密钥采用不可逆读出的写入式托管。"
      />

      <div className="grid gap-6 md:grid-cols-3">
        {paymentProviders.map((provider) => (
          <ProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </>
  );
}
