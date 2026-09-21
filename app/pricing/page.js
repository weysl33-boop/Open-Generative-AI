import PricingClient from '@/components/pricing/PricingClient';

export const metadata = {
  title: '会员方案与定价 — KoyoSIM AI Studio',
  description: '灵活自备 API Key 畅玩 200+ 开源大模型，或升级创作者会员享受专属极速 GPU 通道、4K 超清画质与每月算力赠送。',
};

export default function PricingPage() {
  return <PricingClient />;
}
