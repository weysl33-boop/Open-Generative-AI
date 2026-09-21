import { getUserFromRequest, json } from '@/lib/services/auth';
import { getProfile, updateProfile } from '@/lib/services/profile';
import { COUNTRY_CODES, GENDERS } from '@/lib/onboarding/schema';
import { isSupportedLocale, normalizeLocale } from '@/lib/locales';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const profile = await getProfile(user.id);

  if (!profile) return json({ error: '用户不存在' }, { status: 404 });

  return json({
    user: {
      ...profile,
    }
  });
}

export async function PUT(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const { displayName, bio, website, avatarUrl, socialLinks } = body;
    let locale;
    if (body.locale !== undefined) {
      if (!isSupportedLocale(body.locale)) {
        return json({ error: '不支持的语言 Locale' }, { status: 422 });
      }
      locale = normalizeLocale(body.locale);
    }

    // 国家与性别允许后续在个人主页补全，但一旦选定不可置空：
    // 空串按「未提交」处理，非空值必须是合法枚举，否则回 422。
    const country = typeof body.country === 'string' ? body.country.trim().toUpperCase() : '';
    if (country && !COUNTRY_CODES.includes(country)) {
      return json({ error: '不支持的国家或地区' }, { status: 422 });
    }
    const gender = typeof body.gender === 'string' ? body.gender.trim() : '';
    if (gender && !GENDERS.includes(gender)) {
      return json({ error: '不支持的性别选项' }, { status: 422 });
    }

    const updated = await updateProfile(user.id, {
      displayName,
      bio,
      website,
      avatarUrl,
      socialLinks,
      locale,
      country: country || undefined,
      gender: gender || undefined,
    });
    if (!updated) {
      return json({ error: '没有需要更新的字段' }, { status: 400 });
    }
    const response = json({ user: updated });
    if (locale !== undefined) {
      response.cookies.set('NEXT_LOCALE', locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
      response.cookies.set('locale', locale, { path: '/', maxAge: 31536000, sameSite: 'lax' });
    }
    return response;
  } catch (error) {
    console.error('[profile update error]', error);
    return json({ error: '更新个人信息失败' }, { status: 500 });
  }
}
