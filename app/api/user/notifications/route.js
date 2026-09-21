import { getUserFromRequest, json } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';
import {
  getUserNotifications,
  getUnreadNotificationCount,
  markAllNotificationsAsRead,
} from '@/lib/services/notifications';

export const runtime = 'nodejs';

export async function GET(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return json({ notifications: [], unreadCount: 0 });
    }

    const [notifications, unreadCount] = await Promise.all([
      getUserNotifications(user.id, 20),
      getUnreadNotificationCount(user.id),
    ]);

    return json({
      notifications,
      unreadCount,
    });
  } catch (error) {
    console.error('[notifications GET error]', error);
    return json({ error: '获取通知列表失败' }, { status: 500 });
  }
}

export async function POST(request) {
  const guarded = guardMutation(request);
  if (guarded) return guarded;

  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return json({ error: '请先登录' }, { status: 401 });
    }

    await markAllNotificationsAsRead(user.id);

    return json({
      success: true,
      unreadCount: 0,
      message: '全部通知已标记为已读',
    });
  } catch (error) {
    console.error('[notifications POST error]', error);
    return json({ error: '更新通知状态失败' }, { status: 500 });
  }
}
