import { getUserFromRequest, json } from '@/lib/billing';
import { addCommunityComment, listCommunityComments } from '@/lib/repositories/community';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50', 10);
    const comments = await listCommunityComments(id, limit);
    return json({ comments });
  } catch (error) {
    console.error('[community list comments error]', error);
    return json({ error: '获取评论失败' }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录后再发表评论' }, { status: 401 });

  try {
    const { id } = await params;
    const body = await request.json();
    const content = body.content;

    if (!content || !content.trim()) {
      return json({ error: '评论内容不能为空' }, { status: 400 });
    }

    const comment = await addCommunityComment({
      postId: id,
      userId: user.id,
      content: content.trim(),
    });

    return json({ comment }, { status: 201 });
  } catch (error) {
    console.error('[community add comment error]', error);
    return json({ error: '发表评论失败', details: error.message }, { status: 500 });
  }
}
