import 'server-only';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getUserBySession } from '../services/auth.js';
import { hasPermission } from './permissions.js';

export async function requireAdminPagePermission(permission) {
  const cookieStore = await cookies();
  const token = cookieStore.get('ko_session')?.value;
  const user = await getUserBySession(token);
  if (!user) redirect('/account?next=/admin');
  if (!hasPermission(user.role, permission)) {
    redirect(`/admin/forbidden?p=${encodeURIComponent(permission)}`);
  }
  return user;
}
