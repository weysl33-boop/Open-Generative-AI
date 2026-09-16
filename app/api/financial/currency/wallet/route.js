import { getUserFromRequest, json } from '../../../../../lib/billing.js';
import { getCurrencyWallet, getCurrencyLedger } from '../../../../../lib/financial/index.js';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const wallet = await getCurrencyWallet(user.id);
    const ledger = await getCurrencyLedger(user.id, { limit: 15, offset: 0 });
    return json({
      wallet,
      recentTransactions: ledger,
    });
  } catch (error) {
    console.error('[api/financial/currency/wallet]', error);
    return json({ error: error.message || '获取钱包信息失败' }, { status: 500 });
  }
}
