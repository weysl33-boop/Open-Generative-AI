import { defineConfig } from '@playwright/test';

// Standalone navigation-integrity suite: it only clicks the real sidebar and
// reads what the app renders, so it needs neither a local build nor a database.
// Point it at production for an audit, or at a dev server for regression:
//   NAV_BASE_URL=http://127.0.0.1:3100 npx playwright test --config playwright.nav.config.mjs
export default defineConfig({
  testDir: './tests/nav-audit',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.NAV_BASE_URL || 'https://www.koyosim.com',
    headless: true,
    viewport: { width: 1440, height: 900 },
    screenshot: 'off',
    trace: 'off',
  },
  projects: [{ name: 'chromium' }],
});
