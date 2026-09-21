import { getUserFromRequest, json } from '@/lib/services/auth';
import { getUserCreditLedger } from '@/lib/services/credits';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const rows = await getUserCreditLedger(user.id, 50);
    const items = rows.map((row) => ({
      id: row.id,
      type: Number(row.delta) > 0 ? (row.action_type === 'DAILY_CHECKIN' ? 'checkin' : 'recharge') : 'task',
      title: row.description || (Number(row.delta) > 0 ? '算力入账' : '模型任务消耗'),
      delta: Number(row.delta) > 0 ? `+${row.delta} 积分` : `${row.delta} 积分`,
      balanceAfter: `${row.balance_after} 积分`,
      time: new Date(row.created_at).toLocaleString('zh-CN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }),
      status: '成功',
    }));

    return json({ ledger: items });
  } catch (error) {
    console.error('[credits/ledger error]', error);
    return json({ error: '获取账本流水失败' }, { status: 500 });
  }
}
