import 'server-only';

import crypto from 'node:crypto';

const COOKIE_NAME = 'ko_sms_device';

export function getSmsDeviceToken(request) {
  const value = request?.cookies?.get?.(COOKIE_NAME)?.value;
  return typeof value === 'string' && /^[A-Za-z0-9_-]{32,100}$/.test(value) ? value : null;
}

export function createSmsDeviceToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function setSmsDeviceCookie(response, token) {
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 365 * 24 * 60 * 60,
  });
}
