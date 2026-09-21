import { defineConfig } from '@playwright/test';

/**
 * Visual + responsive gate for the UI design system.
 *
 * It runs against a server you already have up, because the design system is
 * a property of rendered CSS: the only thing that has to be real is the
 * stylesheet the browser resolved.
 *
 * Always record and compare against a production bundle, never `next dev`:
 * the dev overlay injects a "Errors" badge and HMR WebSocket churn into the
 * very frames we diff, and editing source while the dev server is live makes
 * a single run span two different bundles (that produced 8 bogus
 * `ChunkLoadError` failures during the shell migration).
 *
 *   NEXT_DIST_DIR=.agents/verify-next npm run build
 *   NEXT_DIST_DIR=.agents/verify-next npm start -- -p 3210
 *   VISUAL_BASE_URL=http://localhost:3210 npm run test:visual
 *   npm run test:visual:update     # re-record baselines after an approved change
 *
 * `scripts/visual-regression-baseline.mjs` (the older tool) screenshotted the
 * live production site through a puppeteer copy kept outside this repo, and
 * only ever wrote images — it had no compare step, so it could not fail. This
 * config replaces that mechanism with the project's declared Playwright
 * dependency and a real pass/fail.
 */
const baseURL = process.env.VISUAL_BASE_URL || 'http://localhost:3210';

/** Exported so the spec can tell "our origin" from a third party's. */
export { baseURL };

export default defineConfig({
  testDir: './tests/visual',
  snapshotDir: './tests/visual/__snapshots__',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [['line']] : [['list']],
  use: {
    baseURL,
    // Motion is the single largest source of pixel noise, and the design
    // system contract is about the settled state of a surface, not its
    // transition frames.
    animations: 'disabled',
    screenshot: 'off',
    launchOptions: { args: ['--force-color-profile=srgb', '--font-render-hinting=none'] },
    deviceScaleFactor: 1,
    viewport: { width: 1440, height: 900 },
    trace: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium' }],
});
