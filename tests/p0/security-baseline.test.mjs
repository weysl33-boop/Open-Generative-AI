import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { guardSameOrigin } from '../../lib/security/requestGuard.js';
import { resolveProviderApiKey } from '../../lib/security/byok.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

async function source(relativePath) {
  return fs.readFile(path.join(repoRoot, relativePath), 'utf8');
}

async function sourceFilesUnder(relativeDirectory) {
  const root = path.join(repoRoot, relativeDirectory);
  const files = [];
  async function walk(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(absolute);
    }
  }
  await walk(root);
  return Promise.all(files.map(async (absolute) => ({ absolute, content: await fs.readFile(absolute, 'utf8') })));
}

test('P0 closes the legacy direct succeeded-creation write path', async () => {
  const route = await source('app/api/creations/route.js');
  assert.match(route, /status:\s*410/);
  assert.doesNotMatch(route, /recordCreation/);
});

test('P0 exposes liveness/readiness and durable rate limiting', async () => {
  assert.match(await source('app/api/live/route.js'), /status:\s*['"]live['"]/);
  assert.match(await source('app/api/ready/route.js'), /status:\s*result\.ready\s*\?\s*200\s*:\s*503/);
  assert.match(await source('lib/db/migrations/010_security_baseline.sql'), /rate_limit_buckets/);
  assert.match(await source('lib/security/requestGuard.js'), /consumeRateLimit/);
});

test('P0 keeps detailed health diagnostics behind the admin endpoint', async () => {
  const publicHealth = await source('app/api/health/route.js');
  const publicReady = await source('app/api/ready/route.js');
  const adminHealth = await source('app/api/admin/health/route.js');
  assert.doesNotMatch(publicHealth, /pool|pending|drifted|providers/);
  assert.doesNotMatch(publicReady, /pending|drifted|latest/);
  assert.doesNotMatch(publicReady, /@\/lib\/db/);
  assert.match(adminHealth, /requirePermission/);
  assert.match(adminHealth, /getSystemHealth/);
});

test('P1 keeps app and component code behind the application-service boundary', async () => {
  const files = [...await sourceFilesUnder('app'), ...await sourceFilesUnder('components')];
  const violations = files
    .filter(({ content }) => /@\/lib\/(repositories|db)|lib\/(repositories|db)/.test(content))
    .map(({ absolute }) => path.relative(repoRoot, absolute));
  assert.deepEqual(violations, []);
});

test('P1 keeps application services free of raw repository SQL calls', async () => {
  const files = await sourceFilesUnder('lib/services');
  const violations = files
    .filter(({ content }) => /\b(?:query|queryOne|queryMany|execute)\s*\(/.test(content)
      || /tx\.(?:query|queryOne|queryMany|execute)\s*\(/.test(content)
      || /import\s*\{[^}]*\b(?:query|queryOne|queryMany|execute)\b[^}]*\}\s*from\s*['"][^'"]*\/db/.test(content))
    .map(({ absolute }) => path.relative(repoRoot, absolute));
  assert.deepEqual(violations, []);
});

test('P1 keeps routes on explicit application-service imports', async () => {
  const files = await sourceFilesUnder('app');
  const violations = files
    .filter(({ content }) => /lib\/billing(?:['"]|[./])/.test(content))
    .map(({ absolute }) => path.relative(repoRoot, absolute));
  assert.deepEqual(violations, []);
  const authService = await source('lib/services/auth.js');
  const authRepository = await source('lib/repositories/auth.js');
  assert.match(authService, /from ['"]\.\.\/repositories\/auth\.js['"]/);
  assert.match(authService, /withTransaction\(async \(tx\) =>/);
  assert.match(authRepository, /FROM users WHERE/);
  assert.match(authRepository, /WHERE s\.token_hash = \$1 AND s\.revoked_at IS NULL/);
});

test('P0 does not expose raw exception text or upstream error bodies from API routes', async () => {
  const files = await sourceFilesUnder('app/api');
  const violations = files
    .filter(({ content }) => /error\.message|details:\s*error|new Response\(errorText|return .*errorText/.test(content))
    .map(({ absolute }) => path.relative(repoRoot, absolute));
  assert.deepEqual(violations, []);
});

test('P0 public error mapping only permits bounded, known business errors', async () => {
  const { publicErrorMessage } = await import('../../lib/security/publicError.js');
  assert.equal(publicErrorMessage(Object.assign(new Error('额度不足'), { code: 'INSUFFICIENT_CREDITS' }), 'fallback'), '额度不足');
  assert.equal(publicErrorMessage(Object.assign(new Error('postgres://user:secret@db/app'), { code: 'INSUFFICIENT_CREDITS' }), 'fallback'), 'fallback');
  assert.equal(publicErrorMessage(Object.assign(new Error('provider internals'), { code: 'UNKNOWN_PROVIDER_ERROR' }), 'fallback'), 'fallback');
});

test('P0 removes startup dotenv fallback and gates production mocks', async () => {
  const startup = await source('scripts/require-database-url.mjs');
  assert.doesNotMatch(startup, /\.env\.local|readFileSync|process\.cwd/);
  assert.match(await source('lib/services/generationProviders.js'), /MOCK_PROVIDER_DISABLED/);
  assert.match(await source('lib/smsCrypto.js'), /SMS_SECRET_NOT_CONFIGURED/);
  const providerRepository = await source('lib/repositories/providers.js');
  assert.match(providerRepository, /PROVIDER_SECRETS_ENCRYPTION_KEY/);
  assert.match(providerRepository, /PROVIDER_SECRET_KEY_REQUIRED/);
  assert.doesNotMatch(providerRepository, /koyosim_secret_session_production_key/);
});

test('P0 closes hardcoded database fallbacks in operational scripts', async () => {
  for (const relativePath of [
    'scripts/run-prod-migration-safe.mjs',
    'scripts/test-worker-cycle.mjs',
    'scripts/release-safety-check.mjs',
  ]) {
    const script = await source(relativePath);
    assert.doesNotMatch(script, /process\.env\.DATABASE_URL\s*\|\|\s*['"`]postgres(?:ql)?:\/\//, `${relativePath} must not contain a hardcoded database fallback`);
  }
  const migration = await source('scripts/run-prod-migration-safe.mjs');
  assert.match(migration, /DATABASE_URL is required for production migration/);
  assert.match(migration, /checksum drift is deliberately not repaired/i);
});

test('P0 rejects a supplied cross-origin mutation', () => {
  const response = guardSameOrigin(new Request('https://app.example/api/auth/login', {
    method: 'POST',
    headers: { Origin: 'https://evil.example' },
  }));
  assert.equal(response?.status, 403);
});

test('P0 health rendering degrades instead of assuming database fields exist', async () => {
  const page = await source('app/admin/health/page.js');
  const health = await source('lib/services/systemHealth.js');
  assert.match(page, /database\.pool\?\.idle/);
  assert.match(health, /healthCheck\(\)\.catch/);
  assert.match(health, /getMigrationStatus\(\)\.catch/);
});

test('P0 keeps generation work durable and provider credentials server-side', async () => {
  const worker = await source('scripts/generation-worker.mjs');
  const workerService = await source('lib/services/taskWorker.js');
  const workerRepo = await source('lib/repositories/creations.js');
  const generation = await source('app/api/generations/route.js');
  const legacyProxy = await source('app/api/api/v1/[[...path]]/route.js');
  assert.match(worker, /runGenerationWorkerOnce/);
  assert.match(worker, /closePgPool/);
  assert.match(workerService, /listQueuedGenerationIds/);
  assert.match(workerRepo, /WHERE status = 'queued'/);
  assert.match(generation, /GENERATION_ASYNC/);
  assert.match(legacyProxy, /findCreationById/);
  assert.doesNotMatch(legacyProxy, /getApiKey\(request\)/);
});

test('P0 applies mutation body and origin guards to legacy upstream proxies', async () => {
  for (const relativePath of [
    'app/api/agents/[[...path]]/route.js',
    'app/api/app/[[...path]]/route.js',
    'app/api/workflow/[[...path]]/route.js',
    'app/api/v1/creative-agent/[[...path]]/route.js',
  ]) {
    const route = await source(relativePath);
    assert.match(route, /guardMutation/);
    assert.match(route, /maxBytes/);
  }
});

test('P0 guarantees server-managed provider keys without exposing client BYOK', async () => {
  const byok = await source('lib/security/byok.js');
  assert.match(byok, /isByokEnabled/);
  assert.match(byok, /getServerProviderApiKey/);
  for (const relativePath of [
    'app/api/agents/[[...path]]/route.js',
    'app/api/workflow/[[...path]]/route.js',
    'app/api/app/[[...path]]/route.js',
    'app/api/v1/creative-agent/[[...path]]/route.js',
    'app/api/v1/[[...path]]/route.js',
    'app/api/v1/get_upload_url/route.js',
    'app/api/upload-binary/route.js',
    'app/api/v1/upload-binary/route.js',
  ]) {
    const route = await source(relativePath);
    assert.match(route, /getUserFromRequest/);
    if (relativePath.includes('upload-binary')) {
      assert.doesNotMatch(route, /getApiKeyFromRequest/);
    } else {
      assert.match(route, /resolveProviderApiKey/);
      assert.match(route, /headers\.delete\('x-api-key'\)/);
    }
  }
  const legacyApiProxy = await source('app/api/api/v1/[[...path]]/route.js');
  assert.match(legacyApiProxy, /getUserFromRequest/);
  assert.match(legacyApiProxy, /headers\.delete\('x-api-key'\)/);
  assert.match(legacyApiProxy, /getServerProviderApiKey/);
  assert.match(legacyApiProxy, /headers\.set\('x-api-key', apiKey\)/);
});

test('P0 always returns managed server key without accepting client byok overrides', async () => {
  const marker = await resolveProviderApiKey(new Request('https://app.example/api/v1', {
    headers: { 'x-api-key': 'user-supplied-key' },
  }), 'server-key');
  assert.deepEqual(marker, { ok: true, key: 'server-key', managed: true });
});

test('P0 does not auto-link OAuth accounts using an unverified email', async () => {
  const oauth = await source('lib/oauth.js');
  const authService = await source('lib/services/auth.js');
  const callback = await source('app/api/auth/oauth/[provider]/callback/route.js');
  assert.match(oauth, /emailVerified: data\.email_verified === true/);
  assert.match(authService, /const trustedEmail = emailVerified === true \? normalizedEmail : null/);
  assert.match(authService, /if \(targetUser\)/);
  assert.match(callback, /emailVerified: profile\.emailVerified === true/);
});
