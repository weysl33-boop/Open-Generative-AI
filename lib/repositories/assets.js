import 'server-only';

import crypto from 'node:crypto';
import { query, queryMany, queryOne, nowIso, withTransaction } from '../db/index.js';

function generateId(prefix = 'ast') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

// ==========================================
// 文件夹相关仓储方法 (两级子文件夹)
// ==========================================

export async function listAssetFolders(userId) {
  return queryMany(`
    SELECT 
      f.*,
      COALESCE(counts.asset_count, 0)::int AS asset_count
    FROM ai_studio.asset_folders f
    LEFT JOIN (
      SELECT folder_id, COUNT(*) AS asset_count
      FROM ai_studio.user_assets
      WHERE user_id = $1 AND status = 'ready' AND folder_id IS NOT NULL
      GROUP BY folder_id
    ) counts ON f.id = counts.folder_id
    WHERE f.user_id = $1
    ORDER BY f.depth ASC, f.sort_order ASC, f.created_at ASC
  `, [userId]);
}

export async function getAssetFolderById(userId, folderId) {
  return queryOne(`
    SELECT * FROM ai_studio.asset_folders
    WHERE id = $1 AND user_id = $2
  `, [folderId, userId]);
}

export async function createAssetFolder({ userId, parentId = null, name, color = '#22d3ee', icon = 'folder' }) {
  const trimmedName = String(name || '').trim();
  if (!trimmedName) {
    const err = new Error('文件夹名称不能为空');
    err.code = 'INVALID_FOLDER_NAME';
    throw err;
  }
  if (trimmedName.length > 128) {
    const err = new Error('文件夹名称不能超过128字符');
    err.code = 'INVALID_FOLDER_NAME';
    throw err;
  }

  let depth = 1;
  if (parentId) {
    const parent = await getAssetFolderById(userId, parentId);
    if (!parent) {
      const err = new Error('父级文件夹不存在');
      err.code = 'PARENT_FOLDER_NOT_FOUND';
      throw err;
    }
    if (parent.depth >= 2) {
      const err = new Error('资产库最多支持两级子文件夹分类');
      err.code = 'FOLDER_DEPTH_EXCEEDED';
      throw err;
    }
    depth = 2;
  }

  const existing = await queryOne(`
    SELECT id FROM ai_studio.asset_folders
    WHERE user_id = $1 
      AND COALESCE(parent_id, 'root') = COALESCE($2, 'root')
      AND name = $3
  `, [userId, parentId, trimmedName]);

  if (existing) {
    const err = new Error('同层级下已存在同名文件夹');
    err.code = 'FOLDER_NAME_DUPLICATE';
    throw err;
  }

  const folderId = generateId('fld');
  return queryOne(`
    INSERT INTO ai_studio.asset_folders (
      id, user_id, parent_id, depth, name, color, icon, sort_order, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 0, now(), now()
    )
    RETURNING *
  `, [folderId, userId, parentId || null, depth, trimmedName, color, icon]);
}

export async function updateAssetFolder(userId, folderId, { name, color, icon, sortOrder }) {
  const folder = await getAssetFolderById(userId, folderId);
  if (!folder) {
    const err = new Error('目标文件夹不存在');
    err.code = 'FOLDER_NOT_FOUND';
    throw err;
  }

  const updates = [];
  const params = [folderId, userId];

  if (typeof name === 'string') {
    const trimmed = name.trim();
    if (!trimmed) {
      const err = new Error('文件夹名称不能为空');
      err.code = 'INVALID_FOLDER_NAME';
      throw err;
    }
    // Check duplicates
    const duplicate = await queryOne(`
      SELECT id FROM ai_studio.asset_folders
      WHERE user_id = $1 
        AND COALESCE(parent_id, 'root') = COALESCE($2, 'root')
        AND name = $3
        AND id != $4
    `, [userId, folder.parent_id, trimmed, folderId]);
    if (duplicate) {
      const err = new Error('同层级下已存在同名文件夹');
      err.code = 'FOLDER_NAME_DUPLICATE';
      throw err;
    }
    params.push(trimmed);
    updates.push(`name = $${params.length}`);
  }

  if (typeof color === 'string' && color) {
    params.push(color.trim());
    updates.push(`color = $${params.length}`);
  }

  if (typeof icon === 'string' && icon) {
    params.push(icon.trim());
    updates.push(`icon = $${params.length}`);
  }

  if (typeof sortOrder === 'number') {
    params.push(sortOrder);
    updates.push(`sort_order = $${params.length}`);
  }

  if (updates.length === 0) return folder;

  updates.push('updated_at = now()');
  return queryOne(`
    UPDATE ai_studio.asset_folders
    SET ${updates.join(', ')}
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `, params);
}

export async function deleteAssetFolder(userId, folderId) {
  const folder = await getAssetFolderById(userId, folderId);
  if (!folder) {
    const err = new Error('目标文件夹不存在');
    err.code = 'FOLDER_NOT_FOUND';
    throw err;
  }

  // 事务执行：将该文件夹（以及二级子文件夹）的所有资产移至未分类（NULL），避免误删素材
  return withTransaction(async (tx) => {
    // 找出所有下属子文件夹
    const subfolderRows = await tx.queryMany(`
      SELECT id FROM ai_studio.asset_folders
      WHERE user_id = $1 AND parent_id = $2
    `, [userId, folderId]);
    const allFolderIds = [folderId, ...subfolderRows.map(r => r.id)];

    // 将素材 folder_id 置空
    await tx.query(`
      UPDATE ai_studio.user_assets
      SET folder_id = NULL, updated_at = now()
      WHERE user_id = $1 AND folder_id = ANY($2)
    `, [userId, allFolderIds]);

    // 删除文件夹（外键 CASCADE 级联删除二级子文件夹）
    await tx.query(`
      DELETE FROM ai_studio.asset_folders
      WHERE id = $1 AND user_id = $2
    `, [folderId, userId]);

    return { success: true, deletedFolderId: folderId, freedFoldersCount: allFolderIds.length };
  });
}

// ==========================================
// 资产素材相关仓储方法
// ==========================================

export async function listUserAssets({
  userId,
  folderId = 'all',
  assetType = 'all',
  search = '',
  isFavorite = false,
  page = 1,
  limit = 30,
  sort = 'newest',
}) {
  const safeLimit = Math.min(100, Math.max(1, Number(limit) || 30));
  const safePage = Math.max(1, Number(page) || 1);
  const offset = (safePage - 1) * safeLimit;

  const whereConditions = ['a.user_id = $1', "a.status = 'ready'"];
  const params = [userId];

  // 文件夹筛选
  if (folderId === 'unorganized') {
    whereConditions.push('a.folder_id IS NULL');
  } else if (folderId && folderId !== 'all') {
    params.push(folderId);
    whereConditions.push(`a.folder_id = $${params.length}`);
  }

  // 应用类别筛选 (image, video, audio, workflow)
  if (assetType && assetType !== 'all') {
    params.push(assetType.toLowerCase());
    whereConditions.push(`a.asset_type = $${params.length}`);
  }

  // 收藏筛选
  if (isFavorite) {
    whereConditions.push('a.is_favorite = TRUE');
  }

  // 关键字搜索 (支持 prompt, title, model_name)
  if (search && String(search).trim()) {
    params.push(`%${String(search).trim()}%`);
    const idx = params.length;
    whereConditions.push(`(a.prompt ILIKE $${idx} OR a.title ILIKE $${idx} OR a.model_name ILIKE $${idx})`);
  }

  let orderBy = 'a.created_at DESC';
  if (sort === 'oldest') {
    orderBy = 'a.created_at ASC';
  } else if (sort === 'model') {
    orderBy = 'a.model_name ASC NULLS LAST, a.created_at DESC';
  }

  const whereSql = whereConditions.join(' AND ');

  // 总数查询
  const countRow = await queryOne(`
    SELECT COUNT(*)::int AS total
    FROM ai_studio.user_assets a
    WHERE ${whereSql}
  `, params);
  const total = countRow?.total || 0;

  // 分页列表查询 (附带文件夹信息)
  const queryParams = [...params, safeLimit, offset];
  const limitIdx = params.length + 1;
  const offsetIdx = params.length + 2;

  const assets = await queryMany(`
    SELECT 
      a.*,
      f.name AS folder_name,
      f.color AS folder_color,
      f.depth AS folder_depth
    FROM ai_studio.user_assets a
    LEFT JOIN ai_studio.asset_folders f ON a.folder_id = f.id
    WHERE ${whereSql}
    ORDER BY a.is_pinned DESC, ${orderBy}
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `, queryParams);

  return {
    assets,
    total,
    page: safePage,
    limit: safeLimit,
    totalPages: Math.ceil(total / safeLimit) || 1,
  };
}

export async function getUserAssetById(userId, assetId) {
  return queryOne(`
    SELECT 
      a.*,
      f.name AS folder_name,
      f.color AS folder_color,
      f.depth AS folder_depth
    FROM ai_studio.user_assets a
    LEFT JOIN ai_studio.asset_folders f ON a.folder_id = f.id
    WHERE a.id = $1 AND a.user_id = $2
  `, [assetId, userId]);
}

export async function createUserAsset({
  userId,
  folderId = null,
  creationId = null,
  assetType = 'image',
  studioId = 'image',
  title = '',
  mediaUrl,
  thumbnailUrl = null,
  previewUrl = null,
  mimeType = 'image/webp',
  fileSizeBytes = 0,
  width = null,
  height = null,
  aspectRatio = null,
  durationSeconds = null,
  prompt = '',
  negativePrompt = '',
  modelId = null,
  modelName = null,
  provider = null,
  generationParams = {},
  creditCost = 0,
  generationDurationMs = 0,
  isFavorite = false,
  tags = [],
}) {
  if (!mediaUrl) {
    const err = new Error('媒体文件地址(mediaUrl)不能为空');
    err.code = 'INVALID_MEDIA_URL';
    throw err;
  }

  // 验证文件夹归属
  let validFolderId = null;
  if (folderId) {
    const folder = await getAssetFolderById(userId, folderId);
    if (folder) validFolderId = folder.id;
  }

  // 规范化类别
  let normalizedType = (assetType || 'image').toLowerCase();
  if (!['image', 'video', 'audio', 'workflow'].includes(normalizedType)) {
    normalizedType = 'image';
  }

  const assetId = generateId('ast');
  const safeTitle = (title || prompt.substring(0, 30) || '创作素材').trim();

  return queryOne(`
    INSERT INTO ai_studio.user_assets (
      id, user_id, folder_id, creation_id, asset_type, studio_id, title,
      media_url, thumbnail_url, preview_url, mime_type, file_size_bytes,
      width, height, aspect_ratio, duration_seconds,
      prompt, negative_prompt, model_id, model_name, provider,
      generation_params, credit_cost, generation_duration_ms,
      is_favorite, is_pinned, tags, status, created_at, updated_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, $10, $11, $12,
      $13, $14, $15, $16,
      $17, $18, $19, $20, $21,
      $22, $23, $24,
      $25, FALSE, $26, 'ready', now(), now()
    )
    RETURNING *
  `, [
    assetId, userId, validFolderId, creationId, normalizedType, studioId, safeTitle,
    mediaUrl, thumbnailUrl || mediaUrl, previewUrl || mediaUrl, mimeType, fileSizeBytes,
    width, height, aspectRatio, durationSeconds,
    prompt, negativePrompt, modelId, modelName || modelId, provider,
    JSON.stringify(generationParams || {}), creditCost, generationDurationMs,
    Boolean(isFavorite), tags || []
  ]);
}

export async function updateUserAsset(userId, assetId, { folderId, title, isFavorite, isPinned, tags, status }) {
  const asset = await getUserAssetById(userId, assetId);
  if (!asset) {
    const err = new Error('素材资产不存在');
    err.code = 'ASSET_NOT_FOUND';
    throw err;
  }

  const updates = [];
  const params = [assetId, userId];

  if (folderId !== undefined) {
    if (folderId === null || folderId === '') {
      updates.push('folder_id = NULL');
    } else {
      const folder = await getAssetFolderById(userId, folderId);
      if (!folder) {
        const err = new Error('目标文件夹不存在');
        err.code = 'FOLDER_NOT_FOUND';
        throw err;
      }
      params.push(folder.id);
      updates.push(`folder_id = $${params.length}`);
    }
  }

  if (typeof title === 'string') {
    params.push(title.trim());
    updates.push(`title = $${params.length}`);
  }

  if (typeof isFavorite === 'boolean') {
    params.push(isFavorite);
    updates.push(`is_favorite = $${params.length}`);
  }

  if (typeof isPinned === 'boolean') {
    params.push(isPinned);
    updates.push(`is_pinned = $${params.length}`);
  }

  if (Array.isArray(tags)) {
    params.push(tags);
    updates.push(`tags = $${params.length}`);
  }

  if (typeof status === 'string' && ['ready', 'archived', 'trash'].includes(status)) {
    params.push(status);
    updates.push(`status = $${params.length}`);
  }

  if (updates.length === 0) return asset;

  updates.push('updated_at = now()');
  return queryOne(`
    UPDATE ai_studio.user_assets
    SET ${updates.join(', ')}
    WHERE id = $1 AND user_id = $2
    RETURNING *
  `, params);
}

export async function deleteUserAsset(userId, assetId) {
  const asset = await getUserAssetById(userId, assetId);
  if (!asset) {
    const err = new Error('素材资产不存在');
    err.code = 'ASSET_NOT_FOUND';
    throw err;
  }

  await query(`
    DELETE FROM ai_studio.user_assets
    WHERE id = $1 AND user_id = $2
  `, [assetId, userId]);

  return { success: true, deletedAssetId: assetId };
}

export async function batchMoveAssets(userId, assetIds, targetFolderId) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return { count: 0 };
  }

  let resolvedFolderId = null;
  if (targetFolderId) {
    const folder = await getAssetFolderById(userId, targetFolderId);
    if (!folder) {
      const err = new Error('目标文件夹不存在');
      err.code = 'FOLDER_NOT_FOUND';
      throw err;
    }
    resolvedFolderId = folder.id;
  }

  const result = await query(`
    UPDATE ai_studio.user_assets
    SET folder_id = $1, updated_at = now()
    WHERE user_id = $2 AND id = ANY($3)
  `, [resolvedFolderId, userId, assetIds]);

  return { success: true, count: result.rowCount };
}

export async function batchDeleteAssets(userId, assetIds) {
  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return { count: 0 };
  }

  const result = await query(`
    DELETE FROM ai_studio.user_assets
    WHERE user_id = $1 AND id = ANY($2)
  `, [userId, assetIds]);

  return { success: true, count: result.rowCount };
}

export async function getAssetCountsByType(userId) {
  const rows = await queryMany(`
    SELECT 
      asset_type,
      COUNT(*)::int AS count
    FROM ai_studio.user_assets
    WHERE user_id = $1 AND status = 'ready'
    GROUP BY asset_type
  `, [userId]);

  const totalRow = await queryOne(`
    SELECT 
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE folder_id IS NULL)::int AS unorganized,
      COUNT(*) FILTER (WHERE is_favorite = TRUE)::int AS favorites
    FROM ai_studio.user_assets
    WHERE user_id = $1 AND status = 'ready'
  `, [userId]);

  const counts = {
    total: totalRow?.total || 0,
    unorganized: totalRow?.unorganized || 0,
    favorites: totalRow?.favorites || 0,
    image: 0,
    video: 0,
    audio: 0,
    workflow: 0,
  };

  for (const row of rows) {
    if (counts[row.asset_type] !== undefined) {
      counts[row.asset_type] = row.count;
    }
  }

  return counts;
}
