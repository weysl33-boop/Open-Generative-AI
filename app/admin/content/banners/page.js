import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getBannerConfig, getBannerHistory } from '@/lib/services/content';
import BannerManagerClient from './BannerManagerClient';

export const dynamic = 'force-dynamic';

export default async function BannerManagementPage() {
  await requireAdminPagePermission(PERMISSIONS.contentRead);
  const [initialBanner, initialHistory] = await Promise.all([
    getBannerConfig(),
    getBannerHistory(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="内容管理"
        title="顶部公告与横幅管理"
        description="实时配置 Studio 前台顶部推广公告横幅，支持自定义链接、Flova 风格弥散光晕、呼吸动效、CTA 行动按钮、以及历史横幅一键切换与版本回退。"
      />

      <BannerManagerClient initialBanner={initialBanner} initialHistory={initialHistory} />
    </>
  );
}

