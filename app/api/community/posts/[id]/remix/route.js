import { json } from '@/lib/services/auth';
import { recordRemixCount } from '@/lib/services/community';
import { getUserFromRequest } from '@/lib/services/auth';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function POST(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再使用做同款' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 16 * 1024 });
  if (guarded) return guarded;

  try {
    const { id } = await params;
    await recordRemixCount(id);
    return json({ ok: true });
  } catch (error) {
    return json({ error: '记录做同款失败' }, { status: 500 });
  }
}
