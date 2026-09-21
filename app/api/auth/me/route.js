import { getUserFromRequest, json } from '@/lib/services/auth';
import { getEntitlements } from '@/lib/services/billing';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  const entitlements = user ? await getEntitlements(user.id) : null;
  return json({ user, entitlements });
}
