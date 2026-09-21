import { getUserFromRequest, json } from '@/lib/services/auth';
import { wearAvatarFrame } from '@/lib/financial/index.js';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// 佩戴 / 摘下头像框只改一列，不涉及硬币消耗，因此不要求幂等键。
export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再设置头像框' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const frame = body?.frame === undefined ? null : String(body.frame || '');
    const result = await wearAvatarFrame({ userId: user.id, frame });
    return json({ ...result, message: frame ? '头像框已佩戴' : '已摘下头像框' });
  } catch (error) {
    console.error('[api/user/avatar-frame POST]', error);
    return json({ error: publicErrorMessage(error, '头像框设置失败') }, { status: 400 });
  }
}
