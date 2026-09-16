export function cursorEncode(row) {
  if (!row || !row.id) return null;
  const payload = {
    id: row.id,
    createdAt: row.created_at || null,
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function cursorDecode(cursor) {
  if (!cursor || typeof cursor !== 'string') return null;
  try {
    const jsonStr = Buffer.from(cursor, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (!parsed || !parsed.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function toSearchParams(input = {}) {
  if (input instanceof URLSearchParams) return input;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(input || {})) {
    if (Array.isArray(value)) {
      value.forEach((item) => params.append(key, String(item)));
    } else if (value !== undefined && value !== null) {
      params.set(key, String(value));
    }
  }
  return params;
}

export function getPaginationArgs(searchParams, defaultLimit = 25) {
  const params = toSearchParams(searchParams);
  const limit = Math.min(100, Math.max(1, Number(params.get('limit') || defaultLimit)));
  const cursor = cursorDecode(params.get('cursor'));
  return { limit, cursor };
}

export async function pagedQuery({
  baseSql,
  params = [],
  searchParams,
  defaultLimit = 25,
  tableAlias = '',
  order = null,
}) {
  const { limit, cursor } = getPaginationArgs(searchParams, defaultLimit);
  let sql = `${baseSql}`;
  const values = [...params];

  const prefix = tableAlias ? `${tableAlias}.` : '';
  const createdCol = `${prefix}created_at`;
  const idCol = `${prefix}id`;
  const effectiveOrder = order || `${createdCol} DESC, ${idCol} DESC`;

  if (cursor) {
    const cursorCondition = cursor.createdAt
      ? `(${createdCol} < $${values.length + 1} OR (${createdCol} = $${values.length + 2} AND ${idCol} < $${values.length + 3}))`
      : `${idCol} < $${values.length + 1}`;
    sql += sql.includes('WHERE') ? ` AND ${cursorCondition}` : ` WHERE ${cursorCondition}`;
    if (cursor.createdAt) {
      values.push(cursor.createdAt, cursor.createdAt, cursor.id);
    } else {
      values.push(cursor.id);
    }
  }

  sql += ` ORDER BY ${effectiveOrder} LIMIT $${values.length + 1}`;
  values.push(limit + 1);

  const { query } = await import('../db/index.js');
  const res = await query(sql, values);
  const rows = res.rows || [];

  const hasMore = rows.length > limit;
  const result = rows.slice(0, limit);

  return {
    rows: result,
    meta: {
      limit,
      hasMore,
      nextCursor: hasMore ? cursorEncode(result[result.length - 1]) : null,
    },
  };
}
