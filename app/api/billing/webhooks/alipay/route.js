import { json } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST() {
  // Alipay notify data must be RSA-verified with the Alipay public key before
  // granting a subscription. Keep the endpoint closed until keys are set.
  if (!(process.env.ALIPAY_PUBLIC_KEY_PATH && process.env.ALIPAY_PRIVATE_KEY_PATH)) {
    return json({ error: '支付宝回调尚未配置应用私钥和支付宝公钥' }, { status: 503 });
  }
  return json({ error: '支付宝回调适配器待启用' }, { status: 501 });
}
