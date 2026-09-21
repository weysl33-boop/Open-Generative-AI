import { PageHeader } from '@/components/admin/AdminUi';
import LoginConfigurationNav from '@/components/admin/LoginConfigurationNav';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { hasPermission, PERMISSIONS } from '@/lib/admin/permissions';
import { getEmailSmtpOverview } from '@/lib/emailAdmin';
import EmailSmtpConfigClient from './EmailSmtpConfigClient';

export const dynamic = 'force-dynamic';

export default async function EmailProviderPage() {
  const user = await requireAdminPagePermission(PERMISSIONS.providersRead);
  const overview = await getEmailSmtpOverview();
  return (
    <>
      <PageHeader
        eyebrow="登录配置"
        title="邮箱登录与发信"
        description="配置 QQ 企业邮箱 SMTP，用于系统邮箱验证与发信；密码仅加密写入服务端，不会回显到浏览器。"
      />
      <LoginConfigurationNav active="email" />
      <EmailSmtpConfigClient initial={overview} canWrite={hasPermission(user.role, PERMISSIONS.providersWrite)} />
    </>
  );
}
