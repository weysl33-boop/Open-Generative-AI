import { query, queryOne, execute, nowIso } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function findUserById(id, transaction = null) {
  const one = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  const many = transaction?.queryMany
    ? transaction.queryMany.bind(transaction)
    : async (...args) => (await query(...args)).rows;
  const user = await one(`
    SELECT id, uuid, user_number, email, phone, phone_country_code, display_name, avatar_url, avatar_frame, role, credits, status,
           is_activity_public, privacy_settings,
           is_active, is_banned, registration_source, last_login_ip, last_login_at, updated_at, created_at
    FROM users WHERE id = $1
  `, [id]);

  if (!user) return null;

  // 查询已绑定的登录账号
  const accounts = await many(`
    SELECT id, provider, provider_user_id, provider_email, provider_username, created_at, last_login_at
    FROM auth_accounts WHERE user_id = $1
    ORDER BY created_at ASC
  `, [id]);
  user.authAccounts = accounts;
  user.loginProviders = [...new Set(accounts.map(a => a.provider))];

  // 查询运营标签
  const tags = await many(`
    SELECT t.id, t.name, t.slug, t.color, ut.created_at AS tagged_at, ut.created_by
    FROM user_tags ut
    JOIN tags t ON t.id = ut.tag_id
    WHERE ut.user_id = $1
    ORDER BY ut.created_at ASC
  `, [id]);
  user.tags = tags;

  return user;
}

export async function findUserByIdOrNumber(identifier) {
  const clean = String(identifier || '').trim();
  if (!clean) return null;
  if (/^\d{6}$/.test(clean)) {
    return await queryOne(`
      SELECT id, uuid, user_number, email, phone, display_name, avatar_url, avatar_frame, role, credits, status,
             bio, website, social_links, followers_count, following_count, is_activity_public, privacy_settings, created_at
      FROM users WHERE user_number = $1
    `, [clean]);
  }
  return await queryOne(`
    SELECT id, uuid, user_number, email, phone, display_name, avatar_url, avatar_frame, role, credits, status,
           bio, website, social_links, followers_count, following_count, is_activity_public, privacy_settings, created_at
    FROM users WHERE id = $1 OR uuid::text = $1
  `, [clean]);
}

export async function findUserByEmail(email) {
  return await queryOne(`
    SELECT id, uuid, user_number, email, phone, display_name, role, credits, status, last_login_at, updated_at, created_at
    FROM users WHERE LOWER(email) = $1
  `, [String(email).trim().toLowerCase()]);
}

export async function findUserByPhone(phone, countryCode = '+86') {
  const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').trim();
  return await queryOne(`
    SELECT id, uuid, user_number, email, phone, display_name, role, credits, status, last_login_at, updated_at, created_at
    FROM users WHERE phone = $1
  `, [cleanPhone]);
}

export async function getLegacyCredits(userId) {
  const row = await queryOne('SELECT credits FROM users WHERE id = $1', [userId]);
  return Number(row?.credits || 0);
}

export async function getUserProfile(userId) {
  const profile = await queryOne(`
    SELECT id, uuid, user_number, username, email, phone, phone_country_code, locale, display_name, avatar_url,
           role, credits, bio, website, social_links, followers_count, following_count,
           is_activity_public, privacy_settings, created_at, last_login_at,
           country, gender, occupation, occupation_code, purpose_codes, commitment, style_codes,
           usage_intent, creator_persona_code, onboarding_completed, onboarding_step, onboarded_at
    FROM users
    WHERE id = $1
  `, [userId]);
  if (!profile) return null;

  const [creationsCount, communityStats] = await Promise.all([
    queryOne('SELECT COUNT(*)::int AS count FROM creations WHERE user_id = $1', [userId]),
    queryOne(`
      SELECT COUNT(*)::int AS posts_count, COALESCE(SUM(likes_count), 0)::int AS total_likes
      FROM community_posts
      WHERE user_id = $1 AND status = 'published'
    `, [userId]),
  ]);

  return {
    ...profile,
    stats: {
      totalCreations: Number(creationsCount?.count || 0),
      publishedPosts: Number(communityStats?.posts_count || 0),
      totalLikes: Number(communityStats?.total_likes || 0),
    },
  };
}

export async function updateUserPrivacySettings(userId, { isActivityPublic, privacySettings }) {
  const updates = [];
  const values = [userId];
  if (isActivityPublic !== undefined) {
    values.push(Boolean(isActivityPublic));
    updates.push(`is_activity_public = $${values.length}`);
  }
  if (privacySettings !== undefined && typeof privacySettings === 'object') {
    values.push(JSON.stringify(privacySettings));
    updates.push(`privacy_settings = $${values.length}::jsonb`);
  }
  if (!updates.length) return null;
  updates.push('updated_at = NOW()');
  return await queryOne(`
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, user_number, is_activity_public, privacy_settings
  `, values);
}

export async function listUserAuditLogs(userId, limit = 20) {
  return query(`
    SELECT id, actor_email, action, target_type, target_id, risk_level, created_at
    FROM admin_audit_logs
    WHERE target_id = $1
    ORDER BY created_at DESC LIMIT $2
  `, [userId, limit]).then((result) => result.rows);
}

export async function updateUserProfile(userId, fields) {
  const updates = [];
  const values = [userId];
  const add = (column, value, cast = '') => {
    values.push(value);
    updates.push(`${column} = $${values.length}${cast}`);
  };
  // 国家与性别是画像补全项：一旦选定就不可再置空，所以空值按「未提交」处理，
  // 而不是写入 NULL —— 这样用户改选别的值仍然放行。
  const addIfPresent = (column, value) => {
    const text = typeof value === 'string' ? value.trim() : '';
    if (text) add(column, text);
  };

  if (fields.displayName !== undefined) add('display_name', String(fields.displayName).trim().slice(0, 50));
  if (fields.bio !== undefined) add('bio', String(fields.bio).trim().slice(0, 300));
  if (fields.website !== undefined) add('website', String(fields.website).trim().slice(0, 200));
  if (fields.avatarUrl !== undefined) add('avatar_url', String(fields.avatarUrl).trim().slice(0, 500));
  if (fields.locale !== undefined) add('locale', String(fields.locale).trim().slice(0, 16));
  addIfPresent('country', fields.country);
  addIfPresent('gender', fields.gender);
  if (fields.socialLinks !== undefined && fields.socialLinks !== null && typeof fields.socialLinks === 'object' && !Array.isArray(fields.socialLinks)) {
    add('social_links', JSON.stringify(fields.socialLinks), '::jsonb');
  }
  if (!updates.length) return null;

  updates.push('updated_at = NOW()');
  return await queryOne(`
    UPDATE users
    SET ${updates.join(', ')}
    WHERE id = $1
    RETURNING id, username, email, locale, display_name, avatar_url, bio, website, social_links, country, gender
  `, values);
}

export async function listUsers(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let paramIndex = 0;
  const nextParam = () => `$${++paramIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(user_number ILIKE ${nextParam()} OR email ILIKE ${nextParam()} OR id ILIKE ${nextParam()} OR display_name ILIKE ${nextParam()} OR phone ILIKE ${nextParam()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const role = String(params.get('role') || '').trim();
  if (role) {
    clauses.push(`role = ${nextParam()}`);
    sqlParams.push(role);
  }

  const status = String(params.get('status') || '').trim();
  if (status) {
    clauses.push(`status = ${nextParam()}`);
    sqlParams.push(status);
  }

  const provider = String(params.get('provider') || '').trim();
  if (provider) {
    clauses.push(`id IN (SELECT user_id FROM auth_accounts WHERE provider = ${nextParam()})`);
    sqlParams.push(provider);
  }

  const tagId = String(params.get('tag') || '').trim();
  if (tagId) {
    clauses.push(`id IN (SELECT user_id FROM user_tags WHERE tag_id = ${nextParam()})`);
    sqlParams.push(tagId);
  }

  const baseSql = `
    SELECT id, uuid, user_number, email, phone, phone_country_code, display_name, avatar_url, avatar_frame, role, credits, status,
           registration_source, last_login_ip, last_login_at, created_at
    FROM users
    WHERE ${clauses.join(' AND ')}
  `;

  const pagedResult = await pagedQuery({
    baseSql,
    params: sqlParams,
    searchParams: params,
  });

  // 为当前页的用户补充其绑定平台 (loginProviders) 与运营标签 (tags)
  if (pagedResult.rows && pagedResult.rows.length > 0) {
    const userIds = pagedResult.rows.map(u => u.id);
    const inClause = userIds.map((_, index) => `$${index + 1}`).join(',');

    const [accRes, tagRes] = await Promise.all([
      query(`SELECT user_id, provider FROM auth_accounts WHERE user_id IN (${inClause})`, userIds),
      query(`
        SELECT ut.user_id, t.id, t.name, t.slug, t.color
        FROM user_tags ut JOIN tags t ON t.id = ut.tag_id
        WHERE ut.user_id IN (${inClause})
      `, userIds)
    ]);

    const accMap = new Map();
    accRes.rows.forEach(a => {
      if (!accMap.has(a.user_id)) accMap.set(a.user_id, new Set());
      accMap.get(a.user_id).add(a.provider);
    });

    const tagMap = new Map();
    tagRes.rows.forEach(t => {
      if (!tagMap.has(t.user_id)) tagMap.set(t.user_id, []);
      tagMap.get(t.user_id).push({ id: t.id, name: t.name, slug: t.slug, color: t.color });
    });

    pagedResult.rows.forEach(u => {
      u.loginProviders = accMap.has(u.id) ? Array.from(accMap.get(u.id)) : (u.phone ? ['phone'] : ['email']);
      u.tags = tagMap.get(u.id) || [];
    });
  }

  return pagedResult;
}

export async function listAdmins() {
  const res = await query(`
    SELECT id, user_number, email, display_name, avatar_url, role, status, last_login_at, created_at
    FROM users
    WHERE role != 'user'
    ORDER BY created_at ASC
  `);
  return res.rows;
}

export async function listAllTags() {
  const res = await query(`
    SELECT id, name, slug, color, description, created_at
    FROM tags
    ORDER BY created_at ASC
  `);
  return res.rows;
}

export async function addUserTag(userId, tagId, operator = 'admin', transaction = null) {
  const now = nowIso();
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await run(`
    INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, tag_id) DO NOTHING
  `, [userId, tagId, now, operator]);
  return true;
}

export async function removeUserTag(userId, tagId, transaction = null) {
  const run = transaction?.execute ? transaction.execute.bind(transaction) : execute;
  await run(`
    DELETE FROM user_tags WHERE user_id = $1 AND tag_id = $2
  `, [userId, tagId]);
  return true;
}

export async function updateUserStatus(userId, status, transaction = null) {
  const timestamp = nowIso();
  const isBanned = status === 'suspended';
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  await run(`
    UPDATE users SET status = $1, is_banned = $2, updated_at = $3 WHERE id = $4
    RETURNING id
  `, [status, isBanned, timestamp, userId]);
  return await findUserById(userId, transaction);
}

export async function updateUserRole(userId, role, transaction = null) {
  const timestamp = nowIso();
  const run = transaction?.queryOne ? transaction.queryOne.bind(transaction) : queryOne;
  await run(`
    UPDATE users SET role = $1, updated_at = $2 WHERE id = $3
    RETURNING id
  `, [role, timestamp, userId]);
  return await findUserById(userId, transaction);
}

export async function updateUserCredits(dbOrNull, userId, newCredits) {
  const executor = dbOrNull && typeof dbOrNull.execute === 'function' ? dbOrNull.execute.bind(dbOrNull) : execute;
  await executor('UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3', [newCredits, nowIso(), userId]);
}
