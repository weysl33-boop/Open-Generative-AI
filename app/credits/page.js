import CreditsClient from '@/components/credits/CreditsClient';

export const metadata = {
  title: '算力资产与积分中心 — KoyoSIM AI Studio',
  description: '查看个人创作算力、硬币与活动积分余额，支持每日签到领奖励、算力加油包极速充值与变动流水账本。',
};

export default function CreditsPage() {
  return <CreditsClient />;
}
