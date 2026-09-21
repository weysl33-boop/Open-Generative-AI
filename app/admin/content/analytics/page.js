import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getBannerAnalytics } from '@/lib/services/content';
import BannerAnalyticsClient from './BannerAnalyticsClient';

export const dynamic = 'force-dynamic';

export default async function BannerAnalyticsPage() {
  await requireAdminPagePermission(PERMISSIONS.contentRead);
  const initialData = await getBannerAnalytics({ limit: 50, offset: 0 });

  return (
    <>
      <PageHeader
        eyebrow="内容管理"
        title="横幅用户点击与转化记录"
        description="实时监控 Studio 顶部横幅的真实用户展示（Impression）、点击（Click）与主动关闭（Dismiss）全链路埋点数据，核算真实商业转化率 (CTR)，并提供点击流水日志审计。"
      />

      <BannerAnalyticsClient initialData={initialData} />
    </>
  );
}
