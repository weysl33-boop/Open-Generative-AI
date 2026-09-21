import { json } from '@/lib/services/auth';
import { listPublicPlans } from '@/lib/services/billing';
import { paymentChannelStatus } from '@/lib/payments/providerCredentials';

export const runtime = 'nodejs';

// 未登录可读，所以只暴露"这个渠道能不能选"：缺失密钥项、test/live 模式属于内部诊断信息。
function publicChannels(channels) {
  return Object.fromEntries(
    Object.entries(channels).map(([id, channel]) => [id, { enabled: channel.enabled }])
  );
}

export async function GET() {
  const [plans, channels] = await Promise.all([listPublicPlans(), paymentChannelStatus()]);
  const providers = publicChannels(channels);
  return json({ plans, providers });
}
