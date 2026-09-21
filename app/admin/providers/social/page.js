import { getProvidersOverview } from '@/lib/services/providers';
import { PageHeader } from '@/components/admin/AdminUi';
import SocialProviderCard from './SocialProviderCard';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import LoginConfigurationNav from '@/components/admin/LoginConfigurationNav';

export const metadata = {
  title: '社交登录渠道 | 管理后台',
};

export default async function SocialProvidersPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  const allProviders = await getProvidersOverview();
  const socialProviders = allProviders.filter((p) => p.kind === 'social');

  return (
    <>
      <PageHeader
        eyebrow="登录配置"
        title="社交登录渠道"
        description="管理 Google、X、TikTok、微信、QQ 与抖音登录。各平台按独立 OAuth 协议接入；凭据采用 AES-256-GCM 加密托管，并提供回调地址复制与网关探针。微信登录凭据与微信支付隔离。"
      />

      <LoginConfigurationNav active="social" />

      <div className="grid gap-6 md:grid-cols-3">
        {socialProviders.map((provider) => (
          <SocialProviderCard key={provider.id} provider={provider} />
        ))}
      </div>
    </>
  );
}
