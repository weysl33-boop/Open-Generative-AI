import { json } from '@/lib/services/auth';
import { paymentChannelStatus } from '@/lib/payments/providerCredentials';
import { listCreditPacks } from '@/lib/payments/creditPacks';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  let channels = null;
  try {
    channels = await paymentChannelStatus();
  } catch (error) {
    console.error('[billing/credit-packs] payment channel status unavailable', { code: error.code || 'PAYMENT_STATUS_UNAVAILABLE' });
  }
  return json({
    packs: listCreditPacks(),
    // 通用算力包按人民币一次性购买；不暴露 Stripe 或任何凭据诊断信息。
    providers: {
      alipay: { enabled: Boolean(channels?.alipay?.enabled), currency: 'CNY' },
      wechat: { enabled: Boolean(channels?.wechat?.enabled), currency: 'CNY' },
    },
  });
}
