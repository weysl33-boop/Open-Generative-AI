import { redirect } from 'next/navigation';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export const dynamic = 'force-dynamic';

// category 是页内标签选择器，跳转时必须带上，否则旧收藏一律落回默认标签。
// 两条 redirect 分开写：route-map 的蓝图只认字面量目标，三元塞进实参会让跳转在文档里隐身。
export default async function LegacyLoginPage({ searchParams }) {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  const { category } = await searchParams;
  if (category === 'social' || category === 'sms') {
    redirect(`/admin/system/login?category=${category}`);
  }
  redirect('/admin/system/login');
}
