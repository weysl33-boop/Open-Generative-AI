import { query, queryOne, execute, nowIso } from '../db/index.js';
import { pagedQuery, toSearchParams } from '../admin/pagination.js';

export async function findUserById(id) {
  const user = await queryOne(`
    SELECT id, uuid, email, phone, phone_country_code, display_name, avatar_url, role, credits, status,
           is_active, is_banned, registration_source, last_login_ip, last_login_at, updated_at, created_at
    FROM users WHERE id = $1
  `, [id]);

  if (!user) return null;

  // 查询已绑定的登录账号
  const accountsRes = await query(`
    SELECT id, provider, provider_user_id, provider_email, provider_username, created_at, last_login_at
    FROM auth_accounts WHERE user_id = $1
    ORDER BY created_at ASC
  `, [id]);
  user.authAccounts = accountsRes.rows;
  user.loginProviders = [...new Set(accountsRes.rows.map(a => a.provider))];

  // 查询运营标签
  const tagsRes = await query(`
    SELECT t.id, t.name, t.slug, t.color, ut.created_at AS tagged_at, ut.created_by
    FROM user_tags ut
    JOIN tags t ON t.id = ut.tag_id
    WHERE ut.user_id = $1
    ORDER BY ut.created_at ASC
  `, [id]);
  user.tags = tagsRes.rows;

  return user;
}

export async function findUserByEmail(email) {
  return await queryOne(`
    SELECT id, uuid, email, phone, display_name, role, credits, status, last_login_at, updated_at, created_at
    FROM users WHERE LOWER(email) = $1
  `, [String(email).trim().toLowerCase()]);
}

export async function findUserByPhone(phone, countryCode = '+86') {
  const cleanPhone = String(phone || '').replace(/[^\d+]/g, '').trim();
  return await queryOne(`
    SELECT id, uuid, email, phone, display_name, role, credits, status, last_login_at, updated_at, created_at
    FROM users WHERE phone = $1
  `, [cleanPhone]);
}

export async function listUsers(searchParams) {
  const params = toSearchParams(searchParams);
  const clauses = ['1=1'];
  const sqlParams = [];
  let paramIndex = 0;
  const nextParam = () => `$${++paramIndex}`;

  const q = String(params.get('q') || '').trim();
  if (q) {
    clauses.push(`(email ILIKE ${nextParam()} OR id ILIKE ${nextParam()} OR display_name ILIKE ${nextParam()} OR phone ILIKE ${nextParam()})`);
    sqlParams.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
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
    SELECT id, uuid, email, phone, phone_country_code, display_name, avatar_url, role, credits, status,
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
    SELECT id, email, display_name, role, status, last_login_at, created_at
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

export async function addUserTag(userId, tagId, operator = 'admin') {
  const now = nowIso();
  await execute(`
    INSERT INTO user_tags (user_id, tag_id, created_at, created_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id, tag_id) DO NOTHING
  `, [userId, tagId, now, operator]);
  return true;
}

export async function removeUserTag(userId, tagId) {
  await execute(`
    DELETE FROM user_tags WHERE user_id = $1 AND tag_id = $2
  `, [userId, tagId]);
  return true;
}

export async function updateUserStatus(userId, status) {
  const timestamp = nowIso();
  const isBanned = status === 'suspended';
  await execute(`
    UPDATE users SET status = $1, is_banned = $2, updated_at = $3 WHERE id = $4
  `, [status, isBanned, timestamp, userId]);
  return await findUserById(userId);
}

export async function updateUserRole(userId, role) {
  const timestamp = nowIso();
  await execute(`
    UPDATE users SET role = $1, updated_at = $2 WHERE id = $3
  `, [role, timestamp, userId]);
  return await findUserById(userId);
}

export async function updateUserCredits(dbOrNull, userId, newCredits) {
  const executor = dbOrNull && typeof dbOrNull.execute === 'function' ? dbOrNull.execute.bind(dbOrNull) : execute;
  await executor('UPDATE users SET credits = $1, updated_at = $2 WHERE id = $3', [newCredits, nowIso(), userId]);
}
