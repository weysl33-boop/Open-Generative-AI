import { getUserFromRequest, json } from '@/lib/services/auth';
import { updateUserAssetFolder, deleteUserAssetFolder } from '@/lib/services/assets';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

export async function PATCH(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  const { id } = await params;
  if (!id) return json({ error: '缺少文件夹标识' }, { status: 400 });

  try {
    const body = await request.json();
    const updated = await updateUserAssetFolder(user.id, id, {
      name: body.name,
      color: body.color,
      icon: body.icon,
      sortOrder: body.sortOrder !== undefined ? body.sortOrder : (body.sort_order !== undefined ? body.sort_order : undefined),
    });

    return json({ folder: updated });
  } catch (error) {
    console.error('[PATCH /api/assets/folders/[id]]', error);
    const status = error.code === 'FOLDER_NOT_FOUND' ? 404
      : error.code === 'FOLDER_NAME_DUPLICATE' ? 409
        : error.code === 'INVALID_FOLDER_NAME' ? 400
          : 422;
    return json({ error: publicErrorMessage(error, '更新文件夹失败') }, { status });
  }
}

export async function DELETE(request, { params }) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 8 * 1024 });
  if (guarded) return guarded;

  const { id } = await params;
  if (!id) return json({ error: '缺少文件夹标识' }, { status: 400 });

  try {
    const res = await deleteUserAssetFolder(user.id, id);
    return json(res);
  } catch (error) {
    console.error('[DELETE /api/assets/folders/[id]]', error);
    const status = error.code === 'FOLDER_NOT_FOUND' ? 404 : 500;
    return json({ error: publicErrorMessage(error, '删除文件夹失败') }, { status });
  }
}
