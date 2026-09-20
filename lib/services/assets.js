import 'server-only';

import * as assetRepo from '../repositories/assets.js';

export async function getUserAssetFolders(userId) {
  if (!userId) throw new Error('User ID is required');
  const folders = await assetRepo.listAssetFolders(userId);
  
  // 组装成两级树形结构，方便前端直接消费或按扁平数组消费
  const rootFolders = [];
  const folderMap = new Map();

  for (const f of folders) {
    folderMap.set(f.id, { ...f, children: [] });
  }

  for (const f of folders) {
    const item = folderMap.get(f.id);
    if (!f.parent_id) {
      rootFolders.push(item);
    } else {
      const parent = folderMap.get(f.parent_id);
      if (parent) {
        parent.children.push(item);
      } else {
        rootFolders.push(item);
      }
    }
  }

  return {
    folders,
    folderTree: rootFolders,
  };
}

export async function createUserAssetFolder(userId, { name, parentId = null, color = '#22d3ee', icon = 'folder' }) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.createAssetFolder({
    userId,
    parentId,
    name,
    color,
    icon,
  });
}

export async function updateUserAssetFolder(userId, folderId, payload) {
  if (!userId || !folderId) throw new Error('User ID and folderId are required');
  return assetRepo.updateAssetFolder(userId, folderId, payload);
}

export async function deleteUserAssetFolder(userId, folderId) {
  if (!userId || !folderId) throw new Error('User ID and folderId are required');
  return assetRepo.deleteAssetFolder(userId, folderId);
}

export async function getUserAssets(userId, options = {}) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.listUserAssets({
    userId,
    assetType: options.assetType || options.type || 'all',
    folderId: options.folderId || options.folder_id || 'all',
    search: options.search || '',
    isFavorite: Boolean(options.isFavorite || options.favoriteOnly || options.favorite),
    page: options.page || 1,
    limit: options.limit || 30,
    sort: options.sort || 'newest',
  });
}

export async function getUserAsset(userId, assetId) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  return assetRepo.getUserAssetById(userId, assetId);
}

export async function recordUserAsset(userId, payload) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.createUserAsset({
    userId,
    ...payload,
  });
}

export async function updateUserAsset(userId, assetId, payload) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  return assetRepo.updateUserAsset(userId, assetId, payload);
}

export async function deleteUserAsset(userId, assetId) {
  if (!userId || !assetId) throw new Error('User ID and assetId are required');
  return assetRepo.deleteUserAsset(userId, assetId);
}

export async function batchMoveUserAssets(userId, assetIds, targetFolderId) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.batchMoveAssets(userId, assetIds, targetFolderId);
}

export async function batchDeleteUserAssets(userId, assetIds) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.batchDeleteAssets(userId, assetIds);
}

export async function getUserAssetCounts(userId) {
  if (!userId) throw new Error('User ID is required');
  return assetRepo.getAssetCountsByType(userId);
}

/**
 * 将底层生成任务创建自动映射入用户私有资产库
 */
export async function syncCreationToAsset(creation) {
  if (!creation || !creation.user_id || !creation.result_url) return null;

  try {
    let input = {};
    try {
      input = typeof creation.input_summary_json === 'string'
        ? JSON.parse(creation.input_summary_json)
        : (creation.input_summary_json || {});
    } catch {}

    const prompt = input.prompt || creation.label || '';
    const studioId = String(creation.studio_id || 'image').toLowerCase();

    let assetType = 'image';
    if (studioId.includes('video') || studioId.includes('motion') || studioId.includes('cinema') || studioId.includes('clip') || studioId.includes('lip')) {
      assetType = 'video';
    } else if (studioId.includes('audio') || studioId.includes('music') || studioId.includes('sound')) {
      assetType = 'audio';
    } else if (studioId.includes('workflow') || studioId.includes('agent') || studioId.includes('design')) {
      assetType = 'workflow';
    }

    return await assetRepo.createUserAsset({
      userId: creation.user_id,
      creationId: creation.id,
      assetType,
      studioId: creation.studio_id || 'image',
      title: creation.label || prompt.substring(0, 30) || '生成素材',
      mediaUrl: creation.result_url,
      thumbnailUrl: creation.result_url,
      prompt,
      negativePrompt: input.negative_prompt || input.negativePrompt || '',
      modelId: creation.model,
      modelName: creation.model,
      provider: creation.provider,
      generationParams: input.parameters || input || creation.metadata_json || {},
      creditCost: creation.credit_cost || 0,
      generationDurationMs: creation.duration_ms || 0,
      aspectRatio: input.aspect_ratio || input.aspectRatio || null,
      width: input.width || null,
      height: input.height || null,
    });
  } catch (err) {
    console.error('[syncCreationToAsset] failed:', err.message);
    return null;
  }
}
