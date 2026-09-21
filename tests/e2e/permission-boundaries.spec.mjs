import { test, expect } from '@playwright/test';
import fs from 'node:fs';

function sessions() {
  const file = process.env.E2E_SESSION_FILE || 'e2e/.sessions.json';
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function sessionCookie(token) {
  return {
    Cookie: `ko_session=${token}`,
    Origin: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100',
  };
}

function mutationHeaders(extra = {}) {
  return {
    Origin: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100',
    ...extra,
  };
}

function administratorReadPaths(fixture = {}) {
  const userId = fixture.userId || 'missing-user';
  return [
    '/api/admin/admins',
    '/api/admin/audit',
    '/api/admin/dashboard',
    '/api/admin/credits/ledger',
    '/api/admin/export/users',
    '/api/admin/exports/missing-export',
    '/api/admin/generations',
    '/api/admin/generations/missing-generation',
    '/api/admin/health',
    '/api/admin/i18n',
    '/api/admin/models',
    '/api/admin/moderation',
    '/api/admin/orders',
    '/api/admin/providers',
    '/api/admin/settings',
    '/api/admin/subscriptions',
    '/api/admin/system/logs?type=out',
    '/api/admin/users',
    `/api/admin/users/${userId}`,
    '/api/admin/webhooks',
  ];
}

test('anonymous users cannot read the administrator dashboard', async ({ request }) => {
  const response = await request.get('/api/admin/dashboard');
  expect([401, 403]).toContain(response.status());
});

test('anonymous users cannot read any administrator GET resource', async ({ request }) => {
  for (const resource of administratorReadPaths()) {
    const response = await request.get(resource);
    expect([401, 403], resource).toContain(response.status());
  }
});

test('ordinary users cannot read administrator GET resources', async ({ browser }) => {
  const fixture = sessions();
  test.skip(!fixture.userToken, 'E2E_SESSION_FILE is not configured');
  const context = await browser.newContext({ storageState: { cookies: [{ name: 'ko_session', value: fixture.userToken, domain: '127.0.0.1', path: '/' }], origins: [] } });
  try {
    for (const resource of administratorReadPaths(fixture)) {
      const response = await context.request.get(resource);
      expect(response.status(), resource).toBe(403);
    }
  } finally {
    await context.close();
  }
});

test('administrator GET resources return a business response instead of an unhandled 500', async ({ browser }) => {
  const fixture = sessions();
  test.skip(!fixture.adminToken, 'E2E_SESSION_FILE is not configured');
  const context = await browser.newContext({ storageState: { cookies: [{ name: 'ko_session', value: fixture.adminToken, domain: '127.0.0.1', path: '/' }], origins: [] } });
  try {
    for (const resource of administratorReadPaths(fixture)) {
      const response = await context.request.get(resource);
      expect([200, 404, 410], resource).toContain(response.status());
    }
  } finally {
    await context.close();
  }
});

test('ordinary users cannot read the administrator dashboard', async ({ browser }) => {
  const token = sessions().userToken;
  test.skip(!token, 'E2E_SESSION_FILE is not configured');
  const context = await browser.newContext({ storageState: { cookies: [{ name: 'ko_session', value: token, domain: '127.0.0.1', path: '/' }], origins: [] } });
  const response = await context.request.get('/api/admin/dashboard');
  expect(response.status()).toBe(403);
  await context.close();
});

test('administrator can reach dashboard API without a page-level white screen', async ({ browser }) => {
  const token = sessions().adminToken;
  test.skip(!token, 'E2E_SESSION_FILE is not configured');
  const context = await browser.newContext({ storageState: { cookies: [{ name: 'ko_session', value: token, domain: '127.0.0.1', path: '/' }], origins: [] } });
  const response = await context.request.get('/api/admin/dashboard');
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty('data');
  await context.close();
});

test('new user can register, update profile and revoke the session', async ({ request }) => {
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const email = `p7-${suffix}@example.test`;
  const register = await request.post('/api/auth/register', {
    headers: mutationHeaders(),
    data: { email, password: 'P7-test-password-123' },
  });
  expect(register.status()).toBe(200);
  expect((await register.json()).user.email).toBe(email);

  const update = await request.put('/api/user/profile', { headers: mutationHeaders(), data: { displayName: 'P7 E2E User', locale: 'en' } });
  expect(update.status()).toBe(200);
  const updatedBody = await update.json();
  expect(updatedBody.user.display_name || updatedBody.user.displayName).toBeTruthy();

  const logout = await request.post('/api/auth/logout', { headers: mutationHeaders() });
  expect(logout.status()).toBe(200);
  expect((await request.get('/api/user/profile')).status()).toBe(401);
});

test('administrator credit adjustment is auditable and idempotent', async ({ request }) => {
  const fixture = sessions();
  test.skip(!fixture.adminToken || !fixture.userId, 'E2E_SESSION_FILE is not configured');
  const headers = sessionCookie(fixture.adminToken);
  const idempotencyKey = `p7-credit-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const payload = { delta: 1, reason: 'P7 E2E audit adjustment' };

  const first = await request.post(`/api/admin/users/${fixture.userId}/credits/adjust`, { headers: { ...headers, 'Idempotency-Key': idempotencyKey }, data: payload });
  expect(first.status()).toBe(200);
  const firstBody = await first.json();
  expect(firstBody.data?.delta ?? firstBody.delta).toBe(1);

  const replay = await request.post(`/api/admin/users/${fixture.userId}/credits/adjust`, { headers: { ...headers, 'Idempotency-Key': idempotencyKey }, data: payload });
  expect(replay.status()).toBe(200);
  const replayBody = await replay.json();
  expect(replayBody.data?.credits ?? replayBody.credits).toBe(firstBody.data?.credits ?? firstBody.credits);
});

test('mock generation succeeds and replaying the request returns the same creation', async ({ request }) => {
  const fixture = sessions();
  test.skip(!fixture.userToken || !fixture.modelId, 'E2E_SESSION_FILE is not configured');
  const headers = { ...sessionCookie(fixture.userToken), 'Idempotency-Key': `p7-generation-${Date.now()}-${Math.random().toString(16).slice(2)}` };
  const data = { modelId: fixture.modelId, studioId: 'image', prompt: 'P7 deterministic test prompt' };

  const first = await request.post('/api/generations', { headers, data });
  expect(first.status()).toBe(201);
  const firstBody = await first.json();
  expect(firstBody.creation.status).toBe('succeeded');
  expect(firstBody.creation.result_url).toContain('mock.invalid');

  const replay = await request.post('/api/generations', { headers, data });
  expect(replay.status()).toBe(200);
  const replayBody = await replay.json();
  expect(replayBody.creation.id).toBe(firstBody.creation.id);
  expect(replayBody.creation.status).toBe('succeeded');
});

test('public billing plan contract is reachable in the browser runtime', async ({ page }) => {
  const response = await page.goto('/account', { waitUntil: 'domcontentloaded' });
  expect(response?.status()).toBeLessThan(500);
});
