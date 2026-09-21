import { getUserFromRequest, json } from '@/lib/services/auth';
import { toggleFollowCreator, checkFollowStatus, recordUserActivity } from '@/lib/services/activity';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  const { searchParams } = new URL(request.url);
  const targetUserId = searchParams.get('targetUserId') || searchParams.get('userId');

  if (!user || !targetUserId) {
    return json({ isFollowing: false });
  }

  const isFollowing = await checkFollowStatus(user.id, targetUserId);
  return json({ isFollowing });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const targetUserId = String(body.targetUserId || '').trim();
    if (!targetUserId) return json({ error: '目标用户不能为空' }, { status: 400 });

    const result = await toggleFollowCreator(user.id, targetUserId);
    if (result.error) {
      return json({ error: result.message }, { status: 400 });
    }

    const ip = getClientIp(request);
    await recordUserActivity({
      userId: user.id,
      category: 'community',
      action: result.following ? 'user_follow' : 'user_unfollow',
      targetType: 'user',
      targetId: targetUserId,
      ip,
      userAgent: request.headers.get('user-agent'),
    });

    return json({
      success: true,
      following: result.following,
      message: result.following ? '关注成功' : '已取消关注',
    });
  } catch (error) {
    console.error('[follow error]', error);
    return json({ error: '操作失败，请稍后重试' }, { status: 500 });
  }
}
