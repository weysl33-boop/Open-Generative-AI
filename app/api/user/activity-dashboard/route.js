import { getUserFromRequest, json } from '@/lib/services/auth';
import { findActivityDashboardUser, getActivityDashboardData } from '@/lib/services/activity';

export const runtime = 'nodejs';

export async function GET(request) {
  const currentUser = await getUserFromRequest(request);
  const { searchParams } = new URL(request.url);
  const targetId = searchParams.get('userId') || searchParams.get('id');

  let queryUserId = currentUser?.id;

  if (targetId) {
    const targetUser = await findActivityDashboardUser(targetId);
    if (!targetUser) {
      return json({ error: '未找到该用户' }, { status: 404 });
    }
    queryUserId = targetUser.id;

    // 若查询的是其他用户，并且对方设置了“在个人主页隐藏活跃记录”
    const isOwner = currentUser && currentUser.id === targetUser.id;
    if (!isOwner && targetUser.is_activity_public === false) {
      return json({
        isHidden: true,
        user: {
          id: targetUser.id,
          id: targetUser.id,
          displayName: targetUser.display_name || `创作者#${targetUser.id}`,
          avatarUrl: targetUser.avatar_url,
          isActivityPublic: false,
        },
        message: '创作者已将活跃面板设为私密，对外仅展示作品',
      });
    }
  }

  if (!queryUserId) {
    return json({ error: '请先登录或指定要查看的用户' }, { status: 401 });
  }

  try {
    const data = await getActivityDashboardData(queryUserId);
    if (!data) {
      return json({ error: '无法获取用户活跃数据' }, { status: 404 });
    }
    return json(data);
  } catch (error) {
    console.error('[activity-dashboard error]', error);
    return json({ error: '获取活跃数据失败，请稍后重试' }, { status: 500 });
  }
}
