import { getUserFromRequest, json } from '@/lib/billing';
import { deleteCommunityPost, getCommunityPostById } from '@/lib/repositories/community';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const user = await getUserFromRequest(request);

    const post = await getCommunityPostById(id, user?.id || null);
    if (!post) {
      return json({ error: '作品不存在或已被作者删除' }, { status: 404 });
    }

    return json({ post });
  } catch (error) {
    console.error('[community detail error]', error);
    return json({ error: '获取作品详情失败' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const { id } = await params;
    const isAdmin = ['admin', 'super_admin'].includes(user.role);

    const ok = await deleteCommunityPost(id, user.id, isAdmin);
    if (!ok) {
      return json({ error: '作品不存在或无权删除' }, { status: 403 });
    }

    return json({ ok: true, message: '作品已成功从社区下架' });
  } catch (error) {
    console.error('[community delete error]', error);
    return json({ error: '删除作品失败' }, { status: 500 });
  }
}
