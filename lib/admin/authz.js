import crypto from 'node:crypto';
import { NextResponse } from 'next/server.js';
import { getUserBySession } from '../services/auth.js';
import { findUserPasswordCredential } from '../repositories/auth.js';
import { hasPermission } from './permissions.js';
import { guardMutation } from '../security/requestGuard.js';

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

export function resultErrorResponse(error, requestId = null) {
  const message = typeof error === 'string' ? error : error?.message || '请求参数或业务状态无效';
  const isNotFound = /不存在|未找到|找不到/.test(message);
  return errorResponse(
    isNotFound ? 'NOT_FOUND' : 'VALIDATION_ERROR',
    message,
    isNotFound ? 404 : 422,
    requestId
  );
}

export function withAdminErrorBoundary(handler) {
  return async function adminRouteWithErrorBoundary(request, ...args) {
    try {
      return await handler(request, ...args);
    } catch (error) {
      console.error('[admin route]', error?.code || error?.message || 'unknown error');
      return errorResponse('INTERNAL_ERROR', '管理操作暂时不可用，请稍后重试', 500, getRequestId(request));
    }
  };
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
  const requestGuard = guardMutation(request);
  if (requestGuard) return { ok: false, response: requestGuard };
  const adminGuard = await requireAdmin(request);
  if (!adminGuard.ok) return adminGuard;

  const { user, requestId } = adminGuard;
  return authorizePermission(user, permission, requestId);
}

export function authorizePermission(user, permission, requestId = null) {
  if (!user || user.role === 'user' || !hasPermission(user.role, permission)) {
    return {
      ok: false,
      response: errorResponse('FORBIDDEN', `权限不足：当前角色无权执行 ${permission} 操作`, 403, requestId),
    };
  }

  return { ok: true, user, requestId };
}

export async function verifyAdminPassword(userId, password) {
  if (!password || typeof password !== 'string') return false;
  const row = await findUserPasswordCredential(userId);
  if (!row) return false;

  const derived = crypto.scryptSync(password, row.password_salt, 64).toString('hex');
  const actual = Buffer.from(derived, 'hex');
  const expected = Buffer.from(row.password_hash, 'hex');
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    return false;
  }
  return true;
}
