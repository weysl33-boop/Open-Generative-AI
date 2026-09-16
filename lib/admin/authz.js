import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { getUserBySession } from '../billing.js';
import { queryOne } from '../db/index.js';
import { hasPermission } from './permissions.js';

export function getRequestId(request) {
  return request?.headers?.get('x-request-id') || `req_${crypto.randomBytes(8).toString('hex')}`;
}

export function json(data, init = {}) {
  return NextResponse.json(data, init);
}

export function okResponse(data, requestId, meta = {}) {
  return json({
    data,
    meta: {
      requestId: requestId || `req_${crypto.randomBytes(8).toString('hex')}`,
      ...meta,
    },
  });
}

export function errorResponse(code, message, status = 400, requestId = null) {
  return json(
    {
      error: { code, message },
      meta: { requestId: requestId || `req_${crypto.randomBytes(8).toString('hex')}` },
    },
    { status }
  );
}

export async function getUserFromRequest(request) {
  const token = request.cookies.get('ko_session')?.value;
  return await getUserBySession(token);
}

export async function requireAdmin(request) {
  const requestId = getRequestId(request);

  if (process.env.ADMIN_ENABLED === 'false') {
    return {
      ok: false,
      response: errorResponse('ADMIN_DISABLED', '管理后台当前已被系统开关临时禁用', 503, requestId),
    };
  }

  const user = await getUserFromRequest(request);
  if (!user) {
    return {
      ok: false,
      response: errorResponse('UNAUTHENTICATED', '请先登录管理员账户', 401, requestId),
    };
  }

  if (user.role === 'user') {
    return {
      ok: false,
      response: errorResponse('FORBIDDEN', '当前账户为普通用户，无权访问管理运营后台', 403, requestId),
    };
  }

  return { ok: true, user, requestId };
}

export async function requirePermission(request, permission) {
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) return adminGuard;

  const { user, requestId } = adminGuard;
  if (!hasPermission(user.role, permission)) {
    return {
      ok: false,
      response: errorResponse('FORBIDDEN', `权限不足：当前角色无权执行 ${permission} 操作`, 403, requestId),
    };
  }

  return { ok: true, user, requestId };
}

export async function verifyAdminPassword(userId, password) {
  if (!password || typeof password !== 'string') return false;
  const row = await queryOne('SELECT password_hash, password_salt FROM users WHERE id = $1', [userId]);
  if (!row) return false;

  const derived = crypto.scryptSync(password, row.password_salt, 64).toString('hex');
  const actual = Buffer.from(derived, 'hex');
  const expected = Buffer.from(row.password_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return false;
  }
  return true;
}
