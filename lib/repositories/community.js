import crypto from 'node:crypto';
import { query, queryOne, withTransaction } from '../db/pg.js';
import { BUILTIN_COMMUNITY_CASES } from '../community/builtinCases.js';

export async function getPostCoinStatus(postId, userId = null) {
  let post = await queryOne(
    'SELECT id, coins_count, user_id FROM ai_studio.community_posts WHERE id = $1',
    [postId],
  );
  if (!post) {
    const builtin = BUILTIN_COMMUNITY_CASES.find((c) => String(c.id) === String(postId));
    if (builtin) {
      post = { id: builtin.id, coins_count: builtin.coins_count, user_id: builtin.user_id };
    }
  }
  if (!post) return null;
  const history = userId
    ? await queryOne(`
      SELECT COALESCE(SUM(amount), 0) AS total_tipped
      FROM ops_bill.currency_journal_entries
      WHERE user_id = $1 AND biz_type = 'POST_COIN_TIP' AND biz_id = $2
    `, [userId, String(postId)])
    : null;
  return { post, userTipped: Number(history?.total_tipped || 0) };
}

function generateId(prefix = 'post') {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export async function listCommunityPosts({
  category = 'all',
  sort = 'trending',
  tag = '',
  q = '',
  userId = '',
  viewerId = null,
  limit = 24,
  offset = 0,
} = {}) {
  const params = [];
  let whereClauses = ["p.status = 'published'"];

  if (category && category !== 'all') {
    params.push(category);
    whereClauses.push(`p.media_type = $${params.length}`);
  }

  if (tag) {
    params.push(tag);
    whereClauses.push(`$${params.length} = ANY(p.tags)`);
  }

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    whereClauses.push(`(p.title ILIKE $${params.length} OR p.prompt ILIKE $${params.length} OR p.model_name ILIKE $${params.length})`);
  }

  if (userId) {
    params.push(userId);
    whereClauses.push(`p.user_id = $${params.length}`);
  }

  let orderBy = 'p.created_at DESC';
  if (sort === 'trending') {
    orderBy = '(p.likes_count * 4 + p.remix_count * 3 + p.views_count + EXTRACT(EPOCH FROM p.created_at)/86400) DESC';
  } else if (sort === 'likes') {
    orderBy = 'p.likes_count DESC, p.created_at DESC';
  } else if (sort === 'newest') {
    orderBy = 'p.created_at DESC';
  }

  let viewerSelect = 'FALSE AS is_liked';
  if (viewerId) {
    params.push(viewerId);
    viewerSelect = `EXISTS(SELECT 1 FROM ai_studio.community_likes l WHERE l.post_id = p.id AND l.user_id = $${params.length}) AS is_liked`;
  }

  params.push(Math.min(100, Math.max(1, Number(limit) || 24)));
  const limitPlaceholder = `$${params.length}`;
  params.push(Math.max(0, Number(offset) || 0));
  const offsetPlaceholder = `$${params.length}`;

  const sql = `
    SELECT
      p.id,
      p.creation_id,
      p.user_id,
      p.title,
      p.description,
      p.media_type,
      p.media_url,
      p.cover_url,
      p.prompt,
      p.negative_prompt,
      p.model_name,
      p.parameters,
      p.tags,
      p.likes_count,
      p.coins_count,
      p.views_count,
      p.remix_count,
      p.comments_count,
      p.is_featured,
      p.created_at,
      u.display_name AS author_name,
      u.avatar_url AS author_avatar,
      u.username AS author_username,
      u.id AS author_id,
      ${viewerSelect}
    FROM ai_studio.community_posts p
    LEFT JOIN auth_usr.users u ON p.user_id = u.id
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY ${orderBy}
    LIMIT ${limitPlaceholder} OFFSET ${offsetPlaceholder}
  `;

  const result = await query(sql, params);
  const rows = result.rows || [];

  // 融合精选案例集（去重），保证灵感广场有高质量作品
  const matchedBuiltins = BUILTIN_COMMUNITY_CASES.filter((c) => {
    if (category && category !== 'all' && c.media_type !== category) return false;
    if (tag && !c.tags?.includes(tag)) return false;
    if (userId && c.user_id !== userId) return false;
    if (q && q.trim()) {
      const queryLower = q.trim().toLowerCase();
      const match =
        (c.title || '').toLowerCase().includes(queryLower) ||
        (c.prompt || '').toLowerCase().includes(queryLower) ||
        (c.model_name || '').toLowerCase().includes(queryLower);
      if (!match) return false;
    }
    return true;
  });

  const seenIds = new Set(rows.map((r) => String(r.id)));
  const merged = [...rows];
  for (const b of matchedBuiltins) {
    if (!seenIds.has(String(b.id))) {
      merged.push({
        ...b,
        is_liked: false,
      });
      seenIds.add(String(b.id));
    }
  }

  if (sort === 'trending') {
    merged.sort((a, b) => ((b.likes_count || 0) * 4 + (b.remix_count || 0) * 3 + (b.views_count || 0)) - ((a.likes_count || 0) * 4 + (a.remix_count || 0) * 3 + (a.views_count || 0)));
  } else if (sort === 'likes') {
    merged.sort((a, b) => (b.likes_count || 0) - (a.likes_count || 0));
  } else if (sort === 'newest') {
    merged.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  }

  return merged.slice(offset, offset + limit);
}

export async function getCommunityPostById(id, viewerId = null) {
  if (!id) return null;

  // 浏览量自增
  await query('UPDATE ai_studio.community_posts SET views_count = views_count + 1 WHERE id = $1', [id]).catch(() => {});

  const params = [id];
  let viewerSelect = 'FALSE AS is_liked';
  if (viewerId) {
    params.push(viewerId);
    viewerSelect = `EXISTS(SELECT 1 FROM ai_studio.community_likes l WHERE l.post_id = p.id AND l.user_id = $2) AS is_liked`;
  }

  const sql = `
    SELECT
      p.*,
      u.display_name AS author_name,
      u.avatar_url AS author_avatar,
      u.username AS author_username,
      u.id AS author_id,
      u.bio AS author_bio,
      ${viewerSelect}
    FROM ai_studio.community_posts p
    LEFT JOIN auth_usr.users u ON p.user_id = u.id
    WHERE p.id = $1 AND p.status != 'banned'
  `;

  const dbPost = await queryOne(sql, params);
  if (dbPost) return dbPost;

  // 内置精选案例兜底
  const builtin = BUILTIN_COMMUNITY_CASES.find((c) => String(c.id) === String(id));
  if (!builtin) return null;

  let isLiked = false;
  if (viewerId) {
    const likeCheck = await queryOne(
      'SELECT 1 FROM ai_studio.community_likes WHERE post_id = $1 AND user_id = $2',
      [String(id), viewerId]
    ).catch(() => null);
    isLiked = Boolean(likeCheck);
  }

  return {
    ...builtin,
    is_liked: isLiked,
  };
}

export async function createCommunityPost({
  userId,
  creationId = null,
  title,
  description = '',
  mediaType = 'image',
  mediaUrl,
  coverUrl = null,
  prompt = '',
  negativePrompt = '',
  modelName = '',
  parameters = {},
  tags = [],
}) {
  const id = generateId('post');
  const cleanTitle = (title || 'AI 创作分享').slice(0, 255);
  const cleanMediaUrl = String(mediaUrl || '').trim();
  const cleanCover = coverUrl ? String(coverUrl).trim() : cleanMediaUrl;
  const cleanTags = Array.isArray(tags) ? tags.map(t => String(t).trim()).filter(Boolean).slice(0, 10) : [];

  const sql = `
    INSERT INTO ai_studio.community_posts (
      id, creation_id, user_id, title, description,
      media_type, media_url, cover_url, prompt, negative_prompt,
      model_name, parameters, tags, created_at, updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5,
      $6, $7, $8, $9, $10,
      $11, $12, $13, now(), now()
    )
    RETURNING *
  `;

  const values = [
    id,
    creationId || null,
    userId,
    cleanTitle,
    description || '',
    mediaType || 'image',
    cleanMediaUrl,
    cleanCover,
    prompt || '',
    negativePrompt || '',
    modelName || '',
    JSON.stringify(parameters || {}),
    cleanTags,
  ];

  return await queryOne(sql, values);
}

export async function deleteCommunityPost(id, userId, isAdmin = false) {
  if (isAdmin) {
    const res = await query('DELETE FROM ai_studio.community_posts WHERE id = $1', [id]);
    return res.rowCount > 0;
  }
  const res = await query('DELETE FROM ai_studio.community_posts WHERE id = $1 AND user_id = $2', [id, userId]);
  return res.rowCount > 0;
}

export async function toggleCommunityLike(postId, userId) {
  return await withTransaction(async (transaction) => {
    // 检查是否已点赞
    const check = await transaction.query(
      'SELECT id FROM ai_studio.community_likes WHERE post_id = $1 AND user_id = $2',
      [postId, userId]
    );

    let isLiked = false;
    if (check.rows.length > 0) {
      // 取消点赞
      await transaction.execute(
        'DELETE FROM ai_studio.community_likes WHERE post_id = $1 AND user_id = $2',
        [postId, userId]
      );
      await transaction.execute(
        'UPDATE ai_studio.community_posts SET likes_count = GREATEST(0, likes_count - 1) WHERE id = $1',
        [postId]
      );
      isLiked = false;
    } else {
      // 新增点赞
      const likeId = generateId('like');
      await transaction.execute(
        'INSERT INTO ai_studio.community_likes (id, post_id, user_id, created_at) VALUES ($1, $2, $3, now())',
        [likeId, postId, userId]
      );
      await transaction.execute(
        'UPDATE ai_studio.community_posts SET likes_count = likes_count + 1 WHERE id = $1',
        [postId]
      );
      isLiked = true;
    }

    const postRow = await transaction.queryOne('SELECT likes_count FROM ai_studio.community_posts WHERE id = $1', [postId]);
    const likesCount = postRow?.likes_count || 0;

    return { isLiked, likesCount };
  });
}

export async function addCommunityComment({ postId, userId, content }) {
  const cleanContent = String(content || '').trim();
  if (!cleanContent) {
    throw new Error('评论内容不能为空');
  }

  const commentId = generateId('cmt');
  return await withTransaction(async (transaction) => {
    const comment = await transaction.queryOne(
      `INSERT INTO ai_studio.community_comments (id, post_id, user_id, content, created_at)
       VALUES ($1, $2, $3, $4, now())
       RETURNING *`,
      [commentId, postId, userId, cleanContent.slice(0, 1000)]
    );

    await transaction.execute(
      'UPDATE ai_studio.community_posts SET comments_count = comments_count + 1 WHERE id = $1',
      [postId]
    );

    const user = await transaction.queryOne(
      'SELECT id, display_name, avatar_url, username FROM auth_usr.users WHERE id = $1',
      [userId]
    );

    return {
      ...comment,
      author_name: user?.display_name || user?.username || '匿名用户',
      author_avatar: user?.avatar_url || null,
      author_id: user?.id || null,
    };
  });
}

export async function listCommunityComments(postId, limit = 50) {
  const sql = `
    SELECT
      c.*,
      u.display_name AS author_name,
      u.avatar_url AS author_avatar,
      u.username AS author_username,
      u.id AS author_id
    FROM ai_studio.community_comments c
    LEFT JOIN auth_usr.users u ON c.user_id = u.id
    WHERE c.post_id = $1
    ORDER BY c.created_at ASC
    LIMIT $2
  `;
  const res = await query(sql, [postId, Math.min(100, Number(limit) || 50)]);
  return res.rows;
}

export async function recordRemixCount(postId) {
  await query('UPDATE ai_studio.community_posts SET remix_count = remix_count + 1 WHERE id = $1', [postId]).catch(() => {});
}
