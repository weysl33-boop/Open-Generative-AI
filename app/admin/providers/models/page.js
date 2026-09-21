import { redirect } from 'next/navigation';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const dynamic = 'force-dynamic';

// 旧「模型开关与成本定价」页：功能已由 ModelControlCenter（/admin/models）完整覆盖，
// 保留此地址仅兼容历史收藏链接。
export default async function LegacyModelsConfigPage() {
  await requireAdminPagePermission(PERMISSIONS.modelsRead);
  redirect('/admin/models');
}
