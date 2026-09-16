import { PLANS, json } from '@/lib/billing';

export const runtime = 'nodejs';

function stripeMode() {
  if (process.env.STRIPE_MODE) return process.env.STRIPE_MODE;
  return process.env.STRIPE_SECRET_KEY?.startsWith('sk_test_') ? 'test' : 'live';
}

export async function GET() {
  return json({
    plans: PLANS,
    providers: {
      stripe: { enabled: Boolean(process.env.STRIPE_SECRET_KEY), mode: stripeMode(), currencies: ['USD'] },
      wechat: { enabled: Boolean(process.env.WECHAT_MCH_ID && process.env.WECHAT_PRIVATE_KEY_PATH), currencies: ['CNY'] },
      alipay: { enabled: Boolean(process.env.ALIPAY_APP_ID && process.env.ALIPAY_PRIVATE_KEY_PATH), currencies: ['CNY'] },
    },
  });
}
