import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getMotionConfig } from '@/lib/services/content';
import MotionManagerClient from './MotionManagerClient.js';

export const dynamic = 'force-dynamic';

export default async function MotionEffectsPage() {
  await requireAdminPagePermission(PERMISSIONS.contentRead);
  const initialMotion = await getMotionConfig();

  return (
    <>
      <PageHeader
        eyebrow="内容管理"
        title="首页与前台动效设置"
        description="控制 Studio 首页及全站的前端交互动效、背景氛围光晕与设备能耗等级。可在极致炫酷体验与低配设备极简性能之间灵活切换，保存后全站即时生效。"
      />

      <MotionManagerClient initialMotion={initialMotion} />
    </>
  );
}
