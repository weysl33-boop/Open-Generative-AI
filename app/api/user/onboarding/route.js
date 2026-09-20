import { NextResponse } from 'next/server';
import { getUserFromRequest } from '@/lib/services/auth.js';
import * as authRepo from '@/lib/repositories/auth.js';
import { withTransaction } from '@/lib/db/index.js';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

const INDUSTRY_TAG_MAP = {
  '自由创作': 'tag_ind_freelance',
  '个人 / 自媒体': 'tag_ind_media',
  '自媒体': 'tag_ind_media',
  '短漫剧': 'tag_ind_anime',
  '游戏': 'tag_ind_game',
  '游戏美术': 'tag_ind_game',
  '电商': 'tag_ind_ecommerce',
  '电商设计': 'tag_ind_ecommerce',
  '广告': 'tag_ind_ad',
  '商业广告': 'tag_ind_ad',
  'MV': 'tag_ind_mv',
  '音乐MV': 'tag_ind_mv',
};

const PREFERENCE_TAG_MAP = {
  image: 'tag_pref_image',
  video: 'tag_pref_video',
  workflow: 'tag_pref_workflow',
  agent: 'tag_pref_agent',
};

export async function POST(request) {
  try {
    const user = await getUserFromRequest(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录后再提交偏好信息' }, { status: 401 });
    }

    const body = await request.json().catch(() => ({}));
    const displayName = typeof body.displayName === 'string' ? body.displayName.trim() : null;
    const zodiac = typeof body.zodiac === 'string' ? body.zodiac.trim() : null;
    const industry = typeof body.industry === 'string' ? body.industry.trim() : null;
    const occupation = typeof body.occupation === 'string' ? body.occupation.trim() : null;
    const preferences = body.preferences && typeof body.preferences === 'object' ? body.preferences : {};

    await withTransaction(async (tx) => {
      // 1. 更新用户基本资料与入驻字段
      await authRepo.updateUserOnboarding({
        userId: user.id,
        displayName: displayName || user.displayName,
        zodiac,
        industry,
        occupation,
        preferences,
      }, tx);

      // 2. 根据行业领域自动打上运营分析标签
      if (industry && INDUSTRY_TAG_MAP[industry]) {
        await authRepo.addUserTag(user.id, INDUSTRY_TAG_MAP[industry], tx);
      }

      // 3. 根据功能诉求打上功能偏好标签
      const features = Array.isArray(preferences.features) ? preferences.features : [];
      for (const feat of features) {
        const tagId = PREFERENCE_TAG_MAP[feat];
        if (tagId) {
          await authRepo.addUserTag(user.id, tagId, tx);
        }
      }
    });

    return NextResponse.json({
      ok: true,
      message: '用户互动画像与偏好习惯保存成功',
      data: {
        userId: user.id,
        displayName: displayName || user.displayName,
        zodiac,
        industry,
        occupation,
        preferences,
      },
    });
  } catch (error) {
    console.error('[api/user/onboarding] 保存失败:', error);
    return NextResponse.json({ error: publicErrorMessage(error, '保存偏好设置失败，请稍后重试') }, { status: 500 });
  }
}
