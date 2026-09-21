import { getUserFromRequest, json } from '@/lib/services/auth';
import { updatePrivacySettings } from '@/lib/services/profile';
import { recordUserActivity } from '@/lib/services/activity';
import { getClientIp, guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  return json({
    isActivityPublic: user.isActivityPublic !== false,
    privacySettings: user.privacySettings || { hide_activity: false, hide_stats: false },
  });
}

export async function PATCH(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    let isActivityPublic = undefined;
    if (typeof body.isActivityPublic === 'boolean') {
      isActivityPublic = body.isActivityPublic;
    } else if (typeof body.hideActivity === 'boolean') {
      isActivityPublic = !body.hideActivity;
    }

    const currentSettings = user.privacySettings || {};
    const nextSettings = {
      ...currentSettings,
      hide_activity: isActivityPublic !== undefined ? !isActivityPublic : currentSettings.hide_activity,
      hide_stats: typeof body.hideStats === 'boolean' ? body.hideStats : currentSettings.hide_stats,
    };

    const updated = await updatePrivacySettings(user.id, {
      isActivityPublic,
      privacySettings: nextSettings,
    });

    const ip = getClientIp(request);
    await recordUserActivity({
      userId: user.id,
      category: 'account',
      action: 'privacy_toggle',
      targetType: 'user_privacy',
      targetId: user.id,
      metadata: { isActivityPublic, privacySettings: nextSettings },
      ip,
      userAgent: request.headers.get('user-agent'),
    });

    return json({
      success: true,
      isActivityPublic: updated.is_activity_public !== false,
      privacySettings: updated.privacy_settings,
      message: '隐私与主页展示偏好已更新',
    });
  } catch (error) {
    console.error('[privacy patch error]', error);
    return json({ error: '更新隐私配置失败' }, { status: 500 });
  }
}
