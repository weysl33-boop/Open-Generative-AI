import { getUserFromRequest, json } from '@/lib/services/auth';
import { batchMoveUserAssets, batchDeleteUserAssets } from '@/lib/services/assets';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 64 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const { action, assetIds, targetFolderId } = body;

    if (!Array.isArray(assetIds) || assetIds.length === 0) {
      return json({ error: '请选择要操作的素材' }, { status: 400 });
    }

    if (action === 'move') {
      const result = await batchMoveUserAssets(user.id, assetIds, targetFolderId || null);
      return json(result);
    }

    if (action === 'delete') {
      const result = await batchDeleteUserAssets(user.id, assetIds);
      return json(result);
    }

    return json({ error: '不支持的操作类型' }, { status: 400 });
  } catch (error) {
    console.error('[POST /api/assets/batch]', error);
    const status = error.code === 'FOLDER_NOT_FOUND' ? 404 : 500;
    return json({ error: publicErrorMessage(error, '批量操作失败') }, { status });
  }
}
