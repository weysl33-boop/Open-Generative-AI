import { getEntitlements, getUserFromRequest, json } from '@/lib/billing';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  const entitlements = await getEntitlements(user.id);
  return json({ entitlements });
}
