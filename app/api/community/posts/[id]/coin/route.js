import { getUserFromRequest, json } from '@/lib/services/auth';
import { getPostCoinStatus } from '@/lib/services/community';
import { tipPostCoins } from '@/lib/financial/currencyService';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

// GET: 获取当前用户对该作品的投币数与作品累计投币总数
export async function GET(request, { params }) {
  const { id: postId } = await params;
  const user = await getUserFromRequest(request);

  const coinStatus = await getPostCoinStatus(postId, user?.id || null);
  if (!coinStatus) {
    return json({ error: '作品不存在' }, { status: 404 });
  }
  const { post, userTipped } = coinStatus;

  return json({
    postId,
    totalCoins: Number(post.coins_count || 0),
    userTipped,
    isAuthor: user ? user.id === post.user_id : false,
    maxTipPerPost: 2,
  });
}

// POST: 给作品投币 (1 或 2 枚，投出即消耗)
export async function POST(request, { params }) {
  const { id: postId } = await params;
  const user = await getUserFromRequest(request);
  if (!user) {
    return json({ error: '请先登录后再投币' }, { status: 401 });
  }

  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  let body = {};
  try {
    body = await request.json();
  } catch {}

  const amount = parseInt(body.amount || 1, 10);
  if (amount !== 1 && amount !== 2) {
    return json({ error: '单次投币仅支持 1 或 2 枚硬币' }, { status: 400 });
  }

  try {
    const result = await tipPostCoins({
      userId: user.id,
      postId,
      amount,
    });
    return json(result);
  } catch (err) {
    return json({ error: err.message || '投币失败' }, { status: 400 });
  }
}
