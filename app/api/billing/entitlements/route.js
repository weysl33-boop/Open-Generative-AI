import { getUserFromRequest, json } from '@/lib/services/auth';
import { getEntitlements } from '@/lib/services/billing';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  const entitlements = await getEntitlements(user.id);
  return json({ entitlements });
}
