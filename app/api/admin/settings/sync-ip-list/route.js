import { withAdminErrorBoundary, requirePermission, okResponse, resultErrorResponse } from '@/lib/admin/authz';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { syncLatestChinaIpList, getChinaIpBlockConfig } from '@/lib/security/chinaIpBlock';
import { saveSystemSetting } from '@/lib/services/settings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function handlePOST(request) {
  const guard = await requirePermission(request, PERMISSIONS.settingsWrite);
  if (!guard.ok) return guard.response;

  try {
    const syncResult = await syncLatestChinaIpList();

    // 同步完成后，将最新的 CIDR 统计与同步时间写入系统设置
    const currentConfig = await getChinaIpBlockConfig();
    const updatedConfig = {
      ...currentConfig,
      last_synced_at: syncResult.updatedAt,
      total_cidrs: syncResult.totalCidrs,
    };

    await saveSystemSetting({
      actor: guard.user,
      key: 'china_ip_block',
      value: updatedConfig,
      // 与后台开关保持一致：白名单 IP 属运营内部信息，不给匿名可读的可见性。
      visibility: 'private',
      requestId: guard.requestId,
    });

    return okResponse({
      ...syncResult,
      message: `公域最新 IP 库同步成功！当前收录中国大陆网段: ${syncResult.rawV4Count} 个 IPv4 + ${syncResult.rawV6Count} 个 IPv6 (合并为 ${syncResult.mergedV4Count + syncResult.mergedV6Count} 个高速匹配区间)。`,
    }, guard.requestId);
  } catch (err) {
    return resultErrorResponse(`同步失败: ${err.message}`, guard.requestId);
  }
}

export const POST = withAdminErrorBoundary(handlePOST);
