import { getUserFromRequest, json } from '@/lib/services/auth';
import { listUserOrders } from '@/lib/services/billing';

export const runtime = 'nodejs';

function formatPlanName(planId) {
  if (!planId) return '算力充值包';
  const id = String(planId).toLowerCase();
  if (id.includes('pro') && id.includes('year')) return '年度专业创作者会员';
  if (id.includes('pro')) return '月度专业创作者会员';
  if (id.includes('creator')) return '创作者套餐';
  if (id.includes('starter') || id.includes('basic')) return '基础体验包';
  if (id.includes('coin') || id.includes('pack')) return '算力加油包';
  return planId;
}

function formatStatus(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'paid' || s === 'completed' || s === 'succeeded') {
    return { text: '已开具', color: 'emerald', downloadable: true };
  }
  if (s === 'pending') {
    return { text: '待支付', color: 'amber', downloadable: false };
  }
  if (s === 'refunded') {
    return { text: '已退款', color: 'gray', downloadable: false };
  }
  return { text: '处理中', color: 'blue', downloadable: false };
}

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const rawOrders = await listUserOrders(user.id, 50);
    const orders = (rawOrders || []).map((o) => {
      const statusInfo = formatStatus(o.status);
      const currencySymbol = (o.currency || 'CNY').toUpperCase() === 'USD' ? '$' : '¥';
      const amount = (Number(o.amount_minor || 0) / 100).toFixed(2);

      return {
        id: o.id,
        date: new Date(o.created_at).toLocaleDateString('zh-CN', {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }),
        amount: `${currencySymbol} ${amount}`,
        plan: formatPlanName(o.plan_id),
        status: statusInfo.text,
        color: statusInfo.color,
        downloadable: statusInfo.downloadable,
        currency: o.currency || 'CNY',
      };
    });

    return json({ orders });
  } catch (error) {
    console.error('[api/billing/orders/my]', error);
    return json({ error: '获取订单发票失败' }, { status: 500 });
  }
}
