import { getUserFromRequest, json } from '@/lib/billing';
import { getProfile, updateProfile } from '@/lib/services/profile';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const profile = await queryOne(
    `SELECT id, username, email, phone, phone_country_code, display_name, avatar_url,
            role, credits, bio, website, social_links, followers_count, following_count,
            created_at, last_login_at
     FROM auth_usr.users WHERE id = $1`,
    [user.id]
  );

  if (!profile) return json({ error: '用户不存在' }, { status: 404 });

  // 统计用户的生成作品数与已发布的社区作品数、总获赞数
  const creationsCountRow = await queryOne(
    'SELECT COUNT(*)::int AS count FROM ai_studio.creations WHERE user_id = $1',
    [user.id]
  ).catch(() => ({ count: 0 }));

  const communityStatsRow = await queryOne(
    `SELECT COUNT(*)::int AS posts_count, COALESCE(SUM(likes_count), 0)::int AS total_likes
     FROM ai_studio.community_posts WHERE user_id = $1 AND status = 'published'`,
    [user.id]
  ).catch(() => ({ posts_count: 0, total_likes: 0 }));

  return json({
    user: {
      ...profile,
      stats: {
        totalCreations: creationsCountRow?.count || 0,
        publishedPosts: communityStatsRow?.posts_count || 0,
        totalLikes: communityStatsRow?.total_likes || 0,
      }
    }
  });
}

export async function PUT(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const body = await request.json();
    const { displayName, bio, website, avatarUrl, socialLinks } = body;

    const updates = [];
    const params = [user.id];

    if (displayName !== undefined) {
      params.push(String(displayName).trim().slice(0, 50));
      updates.push(`display_name = $${params.length}`);
    }
    if (bio !== undefined) {
      params.push(String(bio).trim().slice(0, 300));
      updates.push(`bio = $${params.length}`);
    }
    if (website !== undefined) {
      params.push(String(website).trim().slice(0, 200));
      updates.push(`website = $${params.length}`);
    }
    if (avatarUrl !== undefined) {
      params.push(String(avatarUrl).trim().slice(0, 500));
      updates.push(`avatar_url = $${params.length}`);
    }
    if (socialLinks !== undefined && typeof socialLinks === 'object') {
      params.push(JSON.stringify(socialLinks));
      updates.push(`social_links = $${params.length}`);
    }

    if (updates.length === 0) {
      return json({ error: '没有需要更新的字段' }, { status: 400 });
    }

    updates.push('updated_at = now()');

    const sql = `
      UPDATE auth_usr.users
      SET ${updates.join(', ')}
      WHERE id = $1
      RETURNING id, username, email, display_name, avatar_url, bio, website, social_links
    `;

    const updated = await queryOne(sql, params);
    return json({ user: updated });
  } catch (error) {
    console.error('[profile update error]', error);
    return json({ error: '更新个人信息失败' }, { status: 500 });
  }
}
