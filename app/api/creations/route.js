import { getUserFromRequest, json } from '@/lib/services/auth';
import { deleteUserCreation, listUserGenerations } from '@/lib/services/generations';
import { guardMutation } from '@/lib/security/requestGuard';

export const runtime = 'nodejs';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  const creations = await listUserGenerations(user.id, request.nextUrl.searchParams.get('limit') || 50, request.nextUrl.searchParams.get('studioId') || '');
  return json({ creations });
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 128 * 1024 });
  if (guarded) return guarded;

  // This legacy endpoint used to let an authenticated user create an
  // arbitrary succeeded record without a model call or credit settlement.
  // All new records must come from /api/generations and its state machine.
  return json({ error: '直接写入作品记录的接口已停用，请通过生成任务创建作品' }, { status: 410 });
}

export async function DELETE(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '需要登录' }, { status: 401 });
  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;
  const id = request.nextUrl.searchParams.get('id');
  if (!id || id.length > 100) return json({ error: '缺少作品标识' }, { status: 400 });
  const ok = await deleteUserCreation(user.id, id);
  if (!ok) return json({ error: '作品不存在或无权删除' }, { status: 404 });
  return json({ ok: true });
}
