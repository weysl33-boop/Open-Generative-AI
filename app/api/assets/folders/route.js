import { getUserFromRequest, json } from '@/lib/services/auth';
import { getUserAssetFolders, createUserAssetFolder } from '@/lib/services/assets';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  try {
    const data = await getUserAssetFolders(user.id);
    return json(data);
  } catch (error) {
    console.error('[GET /api/assets/folders]', error);
    return json({ error: publicErrorMessage(error, '获取文件夹列表失败') }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 32 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const folder = await createUserAssetFolder(user.id, {
      name: body.name,
      parentId: body.parentId || body.parent_id || null,
      color: body.color || '#22d3ee',
      icon: body.icon || 'folder',
    });

    return json({ folder }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/assets/folders]', error);
    const status = error.code === 'FOLDER_DEPTH_EXCEEDED' ? 422
      : error.code === 'FOLDER_NAME_DUPLICATE' ? 409
        : error.code === 'PARENT_FOLDER_NOT_FOUND' ? 404
          : error.code === 'INVALID_FOLDER_NAME' ? 400
            : 422;
    return json({ error: publicErrorMessage(error, '创建文件夹失败') }, { status });
  }
}
