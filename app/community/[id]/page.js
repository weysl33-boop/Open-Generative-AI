import CommunityClient from '@/components/community/CommunityClient';
import { getCommunityPostById } from '@/lib/services/community';

export async function generateMetadata({ params }) {
  const { id } = await params;
  const post = await getCommunityPostById(id).catch(() => null);
  return {
    title: `${post?.title || '作品案例详情'} — KoyoSIM 作品案例系统`,
    description: post?.prompt || '查看 AI 生成参数，一键复制 Prompt 与参数做同款。',
  };
}

export default async function CommunityPostDetailPage({ params }) {
  const { id } = await params;
  return <CommunityClient initialPostId={id} />;
}
