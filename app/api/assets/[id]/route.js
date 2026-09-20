import { getUserFromRequest, json } from '@/lib/services/auth';
import { getUserAsset, updateUserAsset, deleteUserAsset } from '@/lib/services/assets';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

export async function GET(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const { id } = await params;
  if (!id) return json({ error: '缺少资产标识' }, { status: 400 });

  const asset = await getUserAsset(user.id, id);
  if (!asset) return json({ error: '资产不存在或已被删除' }, { status: 404 });

  return json({ asset });
}

export async function PATCH(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  const { id } = await params;
  if (!id) return json({ error: '缺少资产标识' }, { status: 400 });

  try {
    const body = await request.json();
    const updated = await updateUserAsset(user.id, id, {
      folderId: body.folderId !== undefined ? body.folderId : (body.folder_id !== undefined ? body.folder_id : undefined),
      title: body.title,
      isFavorite: body.isFavorite !== undefined ? body.isFavorite : (body.is_favorite !== undefined ? body.is_favorite : undefined),
      isPinned: body.isPinned !== undefined ? body.isPinned : (body.is_pinned !== undefined ? body.is_pinned : undefined),
      tags: body.tags,
      status: body.status,
    });

    return json({ asset: updated });
  } catch (error) {
    console.error('[PATCH /api/assets/[id]]', error);
    const status = error.code === 'ASSET_NOT_FOUND' ? 404
      : error.code === 'FOLDER_NOT_FOUND' ? 400
        : 422;
    return json({ error: publicErrorMessage(error, '更新资产失败') }, { status });
  }
}

export async function DELETE(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  const { id } = await params;
  if (!id) return json({ error: '缺少资产标识' }, { status: 400 });

  try {
    await deleteUserAsset(user.id, id);
    return json({ success: true, deletedId: id });
  } catch (error) {
    console.error('[DELETE /api/assets/[id]]', error);
    const status = error.code === 'ASSET_NOT_FOUND' ? 404 : 500;
    return json({ error: publicErrorMessage(error, '删除资产失败') }, { status });
  }
}
