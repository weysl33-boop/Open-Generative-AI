import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import { getSmsAdminOverview } from '@/lib/smsAdmin';
import SmsProvidersClient from './SmsProvidersClient';
import LoginConfigurationNav from '@/components/admin/LoginConfigurationNav';

export const dynamic = 'force-dynamic';

export default async function SmsProvidersPage() {
  const user = await requireAdminPagePermission(PERMISSIONS.providersRead);
  const overview = await getSmsAdminOverview();
  return (
    <>
      <PageHeader
        eyebrow="Authentication"
        title="短信与手机号认证"
        description="配置 Web 短信线路、风险验证与供应商状态；短信密钥只写入加密存储，不可反显。"
      />
      <LoginConfigurationNav active="sms" />
      <SmsProvidersClient initial={overview} canWrite={hasPermission(user.role, PERMISSIONS.providersWrite)} />
    </>
  );
}
