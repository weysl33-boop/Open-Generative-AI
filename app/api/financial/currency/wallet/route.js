import { getUserFromRequest, json } from '../../../../../lib/services/auth.js';
import { getCurrencyWallet, getCurrencyLedger } from '../../../../../lib/financial/index.js';
import { publicErrorMessage } from '../../../../../lib/security/publicError.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const wanted = Number(new URL(request.url).searchParams.get('limit'));
    const limit = Number.isFinite(wanted) ? Math.min(50, Math.max(1, Math.trunc(wanted))) : 20;
    const wallet = await getCurrencyWallet(user.id);
    const ledger = await getCurrencyLedger(user.id, { limit, offset: 0 });
    return json({
      wallet,
      recentTransactions: ledger,
    });
  } catch (error) {
    console.error('[api/financial/currency/wallet]', error);
    return json({ error: publicErrorMessage(error, '获取钱包信息失败') }, { status: 500 });
  }
}
