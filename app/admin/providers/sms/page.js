import { redirect } from 'next/navigation';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export default async function SmsProvidersPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  redirect('/admin/login?category=sms');
}
