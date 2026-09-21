import { redirect } from 'next/navigation';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const dynamic = 'force-dynamic';

// category 是页内标签选择器，跳转时必须带上，否则旧收藏一律落回默认标签。
export default async function LegacyLoginPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  const { category } = await searchParams;
  redirect(
    category === 'social' || category === 'sms'
      ? `/admin/system/login?category=${category}`
      : '/admin/system/login',
  );
}
