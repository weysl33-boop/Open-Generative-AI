import { getUserFromRequest, json } from '@/lib/services/auth';
import { getEntitlements, getSubscription } from '@/lib/services/billing';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  const subscription = await getSubscription(user.id);
  const entitlements = await getEntitlements(user.id);
  return json({ subscription, entitlements });
}
