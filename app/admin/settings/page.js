import { headers } from 'next/headers';
import { getSystemSettingsList } from '@/lib/services/settings';
import { PageHeader } from '@/components/admin/AdminUi';
import SettingsEditor from './SettingsEditor';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import {
  resolveClientIp,
  isChinaIp,
  getChinaIpBlockConfig,
  getChinaIpBlockStateFile,
  getIpLibraryStatus,
  isChinaIpGateForcedOff,
} from '@/lib/security/chinaIpBlock';

export default async function SystemSettingsPage() {
  await requireAdminPagePermission(PERMISSIONS.settingsRead);
  const settings = await getSystemSettingsList();

  // 拦截开关一旦打开又误判了访问者，后台可能自己就先被 403 挡在门外。
  // 所以这一页必须把"我们现在把你当成谁"摊开给运营看。
  const headerList = await headers();
  const { ip, source } = resolveClientIp(headerList);
  const runtimeConfig = getChinaIpBlockConfig();
  const gateDiagnostics = {
    clientIp: ip,
    ipSource: source,
    isChinaIp: isChinaIp(ip, headerList),
    runtimeEnabled: runtimeConfig.enabled,
    stateFile: getChinaIpBlockStateFile(),
    library: getIpLibraryStatus(),
    forcedOff: isChinaIpGateForcedOff(),
  };

  return (
    <>
      <PageHeader
        eyebrow="系统与前端管理"
        title="系统设置与前端运营"
        description="管理 Studio 前台横幅公告、用户注册开放开关、维护模式及全局非敏感系统配置。变更自动留存审计。"
      />

      <SettingsEditor initialSettings={settings} gateDiagnostics={gateDiagnostics} />
    </>
  );
}
