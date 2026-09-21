import { defineConfig, devices } from '@playwright/test';
import { requireIsolatedTestDatabase } from './scripts/test-database-guard.mjs';

const e2eDatabaseUrl = String(process.env.TEST_DATABASE_URL || '').trim();
const applicationDatabaseUrl = String(process.env.DATABASE_URL || '').trim();
requireIsolatedTestDatabase(e2eDatabaseUrl, applicationDatabaseUrl, 'TEST_DATABASE_URL');

export default defineConfig({
  testDir: './tests/e2e',
  // The seed file intentionally provides one isolated user/admin pair and a
  // mock model for the suite. Keep those stateful API flows deterministic.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['line'], ['html', { outputFolder: 'test-results/playwright-report', open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://127.0.0.1:3100',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run start -- -p 3100',
    url: 'http://127.0.0.1:3100/api/billing/plans',
    // The browser suite uses the isolated PostgreSQL database and an explicit
    // mock-only provider. These flags must never be copied to production.
    env: {
      ...process.env,
      // Never inherit DATABASE_URL from CI or a developer shell. The browser
      // server must use the isolated test database that receives the fixtures.
      DATABASE_URL: e2eDatabaseUrl,
      E2E_TEST_MODE: 'true',
      ALLOW_MOCK_GENERATION: 'true',
      GENERATION_PROVIDER_MODE: 'mock',
      AUTH_ALLOW_MOCK_SMS: 'true',
      SMS_PROVIDER: 'mock',
      AUTH_VERIFICATION_CODE_SECRET: 'e2e-only-verification-secret',
    },
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
