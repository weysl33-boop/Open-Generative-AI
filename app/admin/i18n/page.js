import { PageHeader } from '@/components/admin/AdminUi';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';
import { getLanguageManagementSnapshot } from '@/lib/services/i18n';
import LanguageManagementClient from './LanguageManagementClient';

export const dynamic = 'force-dynamic';

export default async function LanguageManagementPage() {
  await requireAdminPagePermission(PERMISSIONS.i18nRead);
  const snapshot = await getLanguageManagementSnapshot();
  return (
    <>
      <PageHeader
        eyebrow="系统与前端管理"
        title="语言管理"
        description="编辑多语言字段、检查占位符与缺失项，并在真实用户端发布前查看每种语言的有效覆盖率。English 是基准语言。"
      />
      <LanguageManagementClient initialSnapshot={snapshot} />
    </>
  );
}
