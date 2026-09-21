import { getUserFromRequest, json } from '@/lib/services/auth';
import { getOrCreateAgentApiKey, rotateAgentApiKey } from '@/lib/services/profile';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const keyInfo = await getOrCreateAgentApiKey(user.id);
    if (!keyInfo) return json({ error: '用户不存在' }, { status: 404 });

    return json({
      apiKey: keyInfo.key,
      createdAt: keyInfo.createdAt,
    });
  } catch (error) {
    console.error('[api/user/api-key GET]', error);
    return json({ error: '获取 API 密钥失败' }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const keyInfo = await rotateAgentApiKey(user.id);
    if (!keyInfo) return json({ error: '用户不存在' }, { status: 404 });

    return json({
      success: true,
      apiKey: keyInfo.key,
      createdAt: keyInfo.createdAt,
      message: 'API 密钥已成功重新生成并已保存',
    });
  } catch (error) {
    console.error('[api/user/api-key POST]', error);
    return json({ error: '重新生成 API 密钥失败' }, { status: 500 });
  }
}
