import CommunityClient from '@/components/community/CommunityClient';

export async function generateMetadata({ params }) {
  const { id } = await params;
  return {
    title: `作品详情 #${id} — KoyoSIM 社区`,
    description: '查看 AI 生成参数，一键复制 Prompt 与参数做同款。',
  };
}

export default async function CommunityPostDetailPage({ params }) {
  const { id } = await params;
  return <CommunityClient initialPostId={id} />;
}
