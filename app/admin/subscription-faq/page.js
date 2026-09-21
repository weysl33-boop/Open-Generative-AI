import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getSubscriptionFaqConfig, DEFAULT_SUBSCRIPTION_FAQ_CONFIG } from '@/lib/services/subscriptionFaq';
import SubscriptionFaqManagerClient from './SubscriptionFaqManagerClient';

export const metadata = {
  title: '订阅说明与QA问答管理 | KoyoSIM 运营后台',
};

export default async function SubscriptionFaqPage() {
  await requireAdminPagePermission(PERMISSIONS.plansRead);
  const initialConfig = await getSubscriptionFaqConfig();

  return (
    <SubscriptionFaqManagerClient
      initialConfig={initialConfig}
      defaultConfig={DEFAULT_SUBSCRIPTION_FAQ_CONFIG}
    />
  );
}
