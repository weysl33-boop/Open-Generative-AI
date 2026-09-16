import { deleteCreation, getUserFromRequest, json, listCreations, recordCreation } from '@/lib/billing';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  const creations = await listCreations(user.id, request.nextUrl.searchParams.get('limit') || 50, request.nextUrl.searchParams.get('studioId') || '');
  return json({ creations });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  try {
    const body = await request.json();
    if (!body.studioId || typeof body.studioId !== 'string' || body.studioId.length > 80) {
      return json({ error: '缺少工作室标识' }, { status: 400 });
    }
    const result = await recordCreation({ userId: user.id, studioId: body.studioId, label: body.label, resultUrl: body.resultUrl, metadata: body.metadata });
    return json({ id: result.id }, { status: 201 });
  } catch (error) {
    console.error('[creations]', error);
    return json({ error: '保存生成记录失败' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  const id = request.nextUrl.searchParams.get('id');
  if (!id || id.length > 100) return json({ error: '缺少作品标识' }, { status: 400 });
  const ok = await deleteCreation(user.id, id);
  if (!ok) return json({ error: '作品不存在或无权删除' }, { status: 404 });
  return json({ ok: true });
}
