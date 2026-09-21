import { redirect } from 'next/navigation';
import { requireAdminPagePermission } from '@/lib/admin/pageAuth';
import { PERMISSIONS } from '@/lib/admin/permissions';

export default async function EmailProviderPage() {
  await requireAdminPagePermission(PERMISSIONS.providersRead);
  redirect('/admin/email');
}
