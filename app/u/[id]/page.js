import { notFound } from 'next/navigation';
import { getPublicProfile } from '@/lib/services/profile';
import UserProfileClient from '@/components/profile/UserProfileClient';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const resolved = await params;
  const user = await getPublicProfile(resolved.id);
  if (!user) return { title: '创作者主页 — koyosim' };
  const name = user.display_name || `创作者#${user.user_number || ''}`;
  return {
    title: `${name} 的个人主页 — koyosim AI Studio`,
    description: user.bio || `${name} 在 koyosim 上的创作作品展与主页。`,
  };
}

export default async function UserProfilePage({ params }) {
  const resolved = await params;
  const user = await getPublicProfile(resolved.id);
  if (!user) notFound();

  const creator = {
    id: user.id,
    userNumber: user.user_number || '000000',
    displayName: user.display_name || `创作者#${user.user_number || '新星'}`,
    avatarUrl: user.avatar_url,
    bio: user.bio || '',
    followersCount: Number(user.followers_count || 0),
    followingCount: Number(user.following_count || 0),
    isActivityPublic: user.is_activity_public !== false,
    createdAt: user.created_at,
  };

  return <UserProfileClient creator={creator} />;
}
