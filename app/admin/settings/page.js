import { getSystemSettingsList } from '@/lib/services/settings';
import { PageHeader } from '@/components/admin/AdminUi';
import SettingsEditor from './SettingsEditor';

export default async function SystemSettingsPage() {
  const settings = await getSystemSettingsList();

  return (
    <>
      <PageHeader
        eyebrow="系统与前端管理"
        title="系统设置与前端运营"
        description="管理 Studio 前台横幅公告、用户注册开放开关、维护模式及全局非敏感系统配置。变更自动留存审计。"
      />

      <SettingsEditor initialSettings={settings} />
    </>
  );
}
