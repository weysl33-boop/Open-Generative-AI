import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getChannelsHealthOverview } from '@/lib/services/circuitBreaker';
import HealthMonitorClient from './HealthMonitorClient';

export const dynamic = 'force-dynamic';

export default async function HealthMonitorAdminPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);

  const rawChannels = await getChannelsHealthOverview();
  const channels = JSON.parse(JSON.stringify(rawChannels));

  return (
    <>
      <PageHeader
        eyebrow="系统与稳定性"
        title="通道健康与熔断监控"
        description="实时监控所有物理 AI 供应商通道的延迟、24 小时失败率与熔断器（Circuit Breaker）生命周期。当通道连续失败达阈值时自动熔断保护，支持手动恢复与探针扫描。"
      />
      <HealthMonitorClient initialChannels={channels} />
    </>
  );
}
