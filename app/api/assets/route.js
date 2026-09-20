import { getUserFromRequest, json } from '@/lib/services/auth';
import { getUserAssets, recordUserAsset, getUserAssetCounts } from '@/lib/services/assets';
import { guardMutation } from '@/lib/security/requestGuard';
import { publicErrorMessage } from '@/lib/security/publicError';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const url = request.nextUrl;
  const wantSummary = url.searchParams.get('summary') === 'true';

  if (wantSummary) {
    const counts = await getUserAssetCounts(user.id);
    return json({ counts });
  }

  const folderId = url.searchParams.get('folder_id') || url.searchParams.get('folderId') || 'all';
  const assetType = url.searchParams.get('type') || 'all';
  const search = url.searchParams.get('search') || '';
  const isFavorite = url.searchParams.get('favorite') === 'true';
  const page = Number(url.searchParams.get('page')) || 1;
  const limit = Number(url.searchParams.get('limit')) || 30;
  const sort = url.searchParams.get('sort') || 'newest';

  try {
    const result = await getUserAssets(user.id, {
      folderId,
      assetType,
      search,
      isFavorite,
      page,
      limit,
      sort,
    });
    return json(result);
  } catch (error) {
    console.error('[GET /api/assets]', error);
    return json({ error: publicErrorMessage(error, '获取资产列表失败') }, { status: 500 });
  }
}

export async function POST(request) {
  const user = await getUserFromRequest(request);
  if (!user) return json({ error: '请先登录' }, { status: 401 });

  const guarded = guardMutation(request, { maxBytes: 128 * 1024 });
  if (guarded) return guarded;

  try {
    const body = await request.json();
    const asset = await recordUserAsset(user.id, {
      folderId: body.folderId || body.folder_id || null,
      creationId: body.creationId || body.creation_id || null,
      assetType: body.assetType || body.type || 'image',
      studioId: body.studioId || 'image',
      title: body.title || '',
      mediaUrl: body.mediaUrl || body.media_url || body.url,
      thumbnailUrl: body.thumbnailUrl || body.thumbnail_url || null,
      previewUrl: body.previewUrl || body.preview_url || null,
      mimeType: body.mimeType || 'image/webp',
      fileSizeBytes: body.fileSizeBytes || 0,
      width: body.width || null,
      height: body.height || null,
      aspectRatio: body.aspectRatio || null,
      durationSeconds: body.durationSeconds || null,
      prompt: body.prompt || '',
      negativePrompt: body.negativePrompt || '',
      modelId: body.modelId || body.model || null,
      modelName: body.modelName || body.model || null,
      provider: body.provider || null,
      generationParams: body.generationParams || body.parameters || {},
      creditCost: body.creditCost || 0,
      generationDurationMs: body.generationDurationMs || 0,
      isFavorite: Boolean(body.isFavorite),
      tags: Array.isArray(body.tags) ? body.tags : [],
    });

    return json({ asset }, { status: 201 });
  } catch (error) {
    console.error('[POST /api/assets]', error);
    const status = error.code === 'INVALID_MEDIA_URL' ? 400 : 422;
    return json({ error: publicErrorMessage(error, '保存资产失败') }, { status });
  }
}
