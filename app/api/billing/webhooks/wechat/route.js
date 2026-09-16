import { json } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST() {
  // WeChat callbacks must be AES-GCM decrypted and RSA-verified with the
  // merchant API v3 key/certificate before changing entitlements. Keep this
  // endpoint explicit and closed until those credentials are installed.
  if (!(process.env.WECHAT_API_V3_KEY && process.env.WECHAT_CERT_PATH)) {
    return json({ error: '微信支付回调尚未配置 API v3 密钥和平台证书' }, { status: 503 });
  }
  return json({ error: '微信支付回调适配器待启用' }, { status: 501 });
}
