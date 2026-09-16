import { getUserFromRequest, json } from '@/lib/billing';
import { listUserCreditLedger } from '@/lib/repositories/credits';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const limit = Math.min(100, Number(request.nextUrl.searchParams.get('limit') || 50));
  const ledger = await listUserCreditLedger(user.id, limit);
  return json({
    usage: {
      credits: user.credits,
      totalCreations: 0,
    },
    ledger
  });
}
