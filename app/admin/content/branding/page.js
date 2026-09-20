import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getBrandConfig, getNavigationConfig } from '@/lib/services/branding';
import BrandingManagerClient from './BrandingManagerClient';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: '前端Logo与导航管理 | KoyoSIM 运营后台',
};

export default async function BrandingManagementPage() {
  await requireAdminPagePermission(PERMISSIONS.contentRead);
  const [initialBrand, initialNavigation] = await Promise.all([
    getBrandConfig(),
    getNavigationConfig(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="内容与前台运营"
        title="前端Logo与导航管理"
        description="深度管理 Studio 前台品牌标志、Logo 展示模式、内置矢量/外链图标、主题色调以及顶栏菜单按钮的增删改查、角标与排序。所见即所得实时仿真，全站前后端秒级动态生效。"
      />

      <BrandingManagerClient initialBrand={initialBrand} initialNavigation={initialNavigation} />
    </>
  );
}
