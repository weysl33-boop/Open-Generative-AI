import { getUserFromRequest, json } from '@/lib/services/auth';
import { getUserPreferences, updateUserPreferences } from '@/lib/services/profile';
import { isSupportedLocale, normalizeLocale } from '@/lib/locales';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const result = await getUserPreferences(user.id);
  return json({ preferences: { ...result.preferences, locale: result.locale } });
}

export async function PUT(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const { notifyOnComplete, highQualityPreview, locale } = body;

    const targetLocale = locale !== undefined && isSupportedLocale(locale) ? normalizeLocale(locale) : undefined;
    const saved = await updateUserPreferences(user.id, { notifyOnComplete, highQualityPreview, locale: targetLocale });
    if (!saved) return json({ error: '用户不存在' }, { status: 404 });

    const response = json({
      success: true,
      preferences: { ...saved.preferences, locale: saved.locale },
    });

    if (targetLocale !== undefined) {
      response.cookies.set('NEXT_LOCALE', saved.locale, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
      });
      response.cookies.set('locale', saved.locale, {
        path: '/',
        maxAge: 31536000,
        sameSite: 'lax',
      });
    }

    return response;
  } catch (error) {
    console.error('[preferences update error]', error);
    return json({ error: '更新偏好设置失败' }, { status: 500 });
  }
}
