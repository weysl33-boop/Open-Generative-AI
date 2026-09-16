import CommunityClient from '@/components/community/CommunityClient';

export const metadata = {
  title: '即梦社区 — 探索 AI 艺术灵感与一键做同款 | KoyoSIM AI Studio',
  description: '汇聚生图、生视频、生音乐等前沿 AI 艺术创作，支持查看提示词与参数，一键同款生成。',
};

export default function CommunityPage() {
  return <CommunityClient />;
}
