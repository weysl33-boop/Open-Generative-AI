import { getEntitlements, getUserFromRequest, json } from '@/lib/billing';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  const entitlements = user ? await getEntitlements(user.id) : null;
  return json({ user, entitlements });
}
