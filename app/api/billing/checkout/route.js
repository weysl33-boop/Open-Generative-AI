import crypto from 'node:crypto';
import {
  createOrder, getPlan, getUserFromRequest, json, updateOrder,
} from '@/lib/billing';

export const runtime = 'nodejs';

function publicOrigin(request) {
  return process.env.PUBLIC_APP_URL || `${request.nextUrl.protocol}//${request.nextUrl.host}`;
}

async function createStripeCheckout({ request, user, plan, orderId, currency }) {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return { error: 'Stripe 尚未配置商户密钥', status: 503 };
  const mode = process.env.STRIPE_MODE || (secret.startsWith('sk_test_') ? 'test' : 'live');
  if (mode === 'test' && !secret.startsWith('sk_test_')) return { error: 'Stripe 已锁定测试模式，但当前密钥不是测试密钥', status: 503 };
  if (mode === 'live' && secret.startsWith('sk_test_')) return { error: 'Stripe 已锁定正式模式，但当前密钥仍是测试密钥', status: 503 };
  const currencyCode = currency.toLowerCase();
  if (currencyCode !== 'usd') return { error: 'Stripe 当前只接受 USD 方案', status: 400 };
  const configuredPrice = plan.id === 'pro' ? process.env.STRIPE_PRICE_PRO_MONTHLY : process.env.STRIPE_PRICE_TEAM_MONTHLY;
  const params = new URLSearchParams();
  params.set('mode', 'subscription');
  params.set('integration_identifier', `koyosim_checkout_${crypto.randomBytes(4).toString('hex')}`);
  params.set('success_url', `${publicOrigin(request)}/account?checkout=success`);
  params.set('cancel_url', `${publicOrigin(request)}/account?checkout=cancelled`);
  params.set('customer_email', user.email);
  params.set('metadata[user_id]', user.id);
  params.set('metadata[plan_id]', plan.id);
  params.set('metadata[order_id]', orderId);
  params.set('line_items[0][quantity]', '1');
  if (configuredPrice) {
    params.set('line_items[0][price]', configuredPrice);
  } else {
    params.set('line_items[0][price_data][currency]', 'usd');
    params.set('line_items[0][price_data][unit_amount]', String(Math.round(plan.monthlyUsd * 100)));
    params.set('line_items[0][price_data][recurring][interval]', 'month');
    params.set('line_items[0][price_data][product_data][name]', plan.name);
  }
  const stripeResponse = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/x-www-form-urlencoded', 'Stripe-Version': '2026-07-29.dahlia' },
    body: params,
  });
  const payload = await stripeResponse.json();
  if (!stripeResponse.ok || !payload.url) {
    console.error('[billing/stripe-checkout]', stripeResponse.status, payload?.error?.type || 'unknown');
    return { error: 'Stripe 暂时无法创建收款页面', status: 502 };
  }
  updateOrder(orderId, { provider_order_id: payload.id, checkout_url: payload.url });
  return { checkoutUrl: payload.url, orderId };
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要先登录' }, { status: 401 });
  try {
    const body = await request.json();
    const plan = getPlan(body.planId);
    const provider = String(body.provider || '').toLowerCase();
    const currency = provider === 'stripe' ? 'USD' : 'CNY';
    if (!plan || plan.id === 'free') return json({ error: '请选择付费方案' }, { status: 400 });
    if (!['stripe', 'wechat', 'alipay'].includes(provider)) return json({ error: '不支持的支付渠道' }, { status: 400 });
    const amountMinor = provider === 'stripe' ? Math.round(plan.monthlyUsd * 100) : Math.round(plan.monthlyCny * 100);
    if (!amountMinor) return json({ error: '该方案尚未设置价格' }, { status: 400 });
    if (provider === 'stripe' && !process.env.STRIPE_SECRET_KEY) {
      return json({ error: 'Stripe 尚未配置商户密钥，请先补充服务器环境变量' }, { status: 503 });
    }
    if (provider === 'wechat' && !(process.env.WECHAT_MCH_ID && process.env.WECHAT_PRIVATE_KEY_PATH && process.env.WECHAT_APP_ID)) {
      return json({ error: '微信支付尚未配置商户号、AppID 和商户私钥' }, { status: 503 });
    }
    if (provider === 'alipay' && !(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY_PATH)) {
      return json({ error: '支付宝尚未配置 AppID 和应用私钥' }, { status: 503 });
    }
    const orderId = createOrder({ userId: user.id, provider, plan, amountMinor, currency });
    if (provider === 'stripe') {
      const result = await createStripeCheckout({ request, user, plan, orderId, currency });
      if (result.error) return json({ error: result.error }, { status: result.status });
      return json(result);
    }
    // WeChat Pay and Alipay adapters are intentionally gated until merchant
    // credentials are present. This prevents an order from being marked paid
    // without a signed provider callback.
    return json({ error: `${provider === 'wechat' ? '微信支付' : '支付宝'}适配器待商户凭据启用`, orderId }, { status: 503 });
  } catch (error) {
    console.error('[billing/checkout]', error);
    return json({ error: '创建订单失败' }, { status: 500 });
  }
}
