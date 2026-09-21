import { getUserFromRequest, json } from '@/lib/services/auth';
import { toggleCommunityLike } from '@/lib/services/community';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再进行点赞' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const { id } = await params;
    const result = await toggleCommunityLike(id, user.id);
    return json(result);
  } catch (error) {
    console.error('[community like error]', error);
    return json({ error: '点赞操作失败' }, { status: 500 });
  }
}
