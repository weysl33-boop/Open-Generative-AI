import { expect, test } from '@playwright/test';
import { baseURL } from '../../playwright.visual.config.mjs';

/**
 * PART 02 viewport contract. Desktop and mobile are graded as separate
 * layouts, not as one layout scaled down, so every route is walked at all ten
 * widths; a pixel baseline is then recorded where the render is deterministic
 * enough to be worth defending.
 */
const VIEWPORTS = [
  { name: '1920', width: 1920, height: 1080 },
  { name: '1600', width: 1600, height: 900 },
  { name: '1440', width: 1440, height: 900 },
  { name: '1366', width: 1366, height: 768 },
  { name: '1280', width: 1280, height: 800 },
  { name: '1024', width: 1024, height: 768 },
  { name: '768', width: 768, height: 1024 },
  { name: '430', width: 430, height: 932 },
  { name: '390', width: 390, height: 844 },
  { name: '375', width: 375, height: 812 },
];

const MOBILE_NAMES = new Set(['430', '390', '375']);

/**
 * `shot` lists the viewports that get a pixel baseline. The design system
 * gallery is static, so all ten are defended; product pages read live data
 * (credit balances, model catalogues, community posts) and are defended at the
 * two canonical sizes — one desktop, one phone — with a tolerance, while the
 * structural checks below still run at all ten.
 */
const ROUTES = [
  { path: '/design-system', name: 'design-system', shot: VIEWPORTS.map((v) => v.name) },
  { path: '/studio/image', name: 'studio-image', shot: ['1440', '390'] },
  { path: '/studio/video', name: 'studio-video', shot: ['1440', '390'] },
  { path: '/studio/audio', name: 'studio-audio', shot: ['1440', '390'] },
  { path: '/studio/cinema', name: 'studio-cinema', shot: ['1440', '390'] },
  { path: '/studio/lipsync', name: 'studio-lipsync', shot: ['1440', '390'] },
  { path: '/community', name: 'community', shot: ['1440', '390'] },
  { path: '/pricing', name: 'pricing', shot: ['1440', '390'] },
];

const CONSOLE_NOISE = [
  /Download the React DevTools/i,
  /favicon/i,
  /third-party cookie/i,
  // Carries no URL; the response listener below reports the same failure with
  // the path attached, which is the only version worth asserting on.
  /Failed to load resource: the server responded/i,
];

/**
 * Pre-existing product defects, filed in docs/UI_AUDIT.md rather than fixed
 * here: PART 32 ranks Workflow below the token and primitive work, and the
 * branding logo is a row in the deployment database, not a source file.
 * They are named so the gate can go green today and still fail on anything
 * new — an empty allowlist is not the same as a clean run.
 */
const KNOWN_DEBT = [
  /401 GET \/api\/workflow\/get-template-workflows/,
  /Failed to fetch template workflows: 401/,
  /404 GET \/uploads\/branding\/logo-/,
];

/**
 * A route is "open" when the thing it is meant to show has replaced its boot
 * state. Without this the suite screenshots a spinner and passes — which is
 * exactly what it did on a first run: all five studio baselines came out
 * byte-identical because every studio was captured at the same loading frame.
 * The gallery is the exception: it demos spinners on purpose, so it is ready
 * once its measured contrast ratios have landed.
 */
const READY = {
  'design-system': () => /\d\.\d\d/.test(document.body.innerText),
  default: () => document.querySelectorAll('.animate-spin').length === 0,
};

async function settle(page) {
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        let timer = null;
        const done = () => {
          clearTimeout(timer);
          observer.disconnect();
          resolve();
        };
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          timer = setTimeout(done, 400);
        });
        observer.observe(document.body, { childList: true, subtree: true, attributes: true });
        timer = setTimeout(done, 400);
        setTimeout(done, 12000);
      }),
  );
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  });
}

async function open(page, route) {
  await page.goto(route.path, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(READY[route.name] || READY.default, null, { timeout: 25_000 });
  await settle(page);
}

/**
 * A page that scrolls sideways on a phone is the defect; a child that pokes
 * past the edge inside its own `overflow-x-auto` rail is intended behaviour, so
 * offenders are reported as diagnostics and only the document width is asserted.
 */
async function measureOverflow(page) {
  return page.evaluate(() => {
    const clientWidth = document.documentElement.clientWidth;
    const clipped = (node) => {
      for (let el = node.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        if (getComputedStyle(el).overflowX !== 'visible') return true;
      }
      return false;
    };
    const offenders = [];
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || clipped(el)) continue;
      if (box.right > clientWidth + 1) {
        offenders.push(
          `${el.tagName.toLowerCase()}.${String(el.className || '').split(/\s+/).slice(0, 3).join('.')}@${Math.round(box.right)}`,
        );
        if (offenders.length >= 4) break;
      }
    }

    /**
     * A separate, stricter pass for controls. The document-width check above
     * can be satisfied by an `overflow-hidden` app shell, which is exactly how
     * the studio header shipped a 188px-wide overflow at 390px with a green
     * test run: the page did not scroll, so the extra controls simply stopped
     * existing for anyone on a phone. A control that cannot be reached or
     * scrolled into view is a defect even when the page itself never scrolls,
     * so this ignores clip ancestors and only trusts a scrollable one.
     */
    const unreachable = [];
    const scrolls = (node) => {
      for (let el = node.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        const { overflowX, overflowY } = getComputedStyle(el);
        if (overflowX === 'auto' || overflowX === 'scroll') return true;
        if (overflowY === 'auto' || overflowY === 'scroll') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body a[href], body button, body input, body select, body textarea')) {
      if (el.closest('[hidden], [aria-hidden="true"]')) continue;
      const box = el.getBoundingClientRect();
      if (!box.width || !box.height || scrolls(el)) continue;
      // Horizontal only: a control below the fold is normal, and these frames
      // are captured fullPage.
      if (box.right > clientWidth + 1 || box.left < -1) {
        // `title` is in the chain because icon-only controls in the composer
        // carry no text and no aria-label; without it the report says `""`,
        // which names nothing. The missing aria-label is its own a11y defect.
        const label = (
          el.innerText ||
          el.getAttribute('aria-label') ||
          el.getAttribute('title') ||
          el.getAttribute('href') ||
          ''
        )
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 24);
        unreachable.push(label || `${el.tagName.toLowerCase()}-unlabeled@${Math.round(box.right)}`);
        if (unreachable.length >= 12) break;
      }
    }

    return {
      clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      offenders,
      unreachable,
    };
  });
}

/**
 * Controls that render outside the viewport, keyed `route@width`.
 *
 * The reachability assertion below is stricter than the page-scroll check:
 * the studio shell is `overflow-hidden`, so a control pushed past the edge
 * never creates a scrollbar and simply stops existing for that user. This
 * ledger carried 13 entries — the Image, Video and Cinema prompt composers all
 * shipped `Draw`/`Generate`/`480p`/`Shoot Scene` off-screen below 1024px — and
 * one change to the shared `PromptControls` rail cleared every one of them,
 * which is the argument for fixing the recipe rather than the nine screens
 * that consume it.
 *
 * It is empty by intent. Adding to it is how a P1 gets scheduled instead of
 * hidden, and an entry that stops reproducing fails the run so it gets deleted.
 */
const LAYOUT_DEBT = {};

/**
 * Product surfaces hot-link third-party media (result images from
 * `cdn.muapi.ai`). When that CDN drops a connection the page still renders
 * correctly — but the frame is missing pixels that have nothing to do with our
 * CSS, and the console line it leaves behind is the content-free
 * "Failed to load resource: net::ERR_…".
 *
 * Widening `CONSOLE_NOISE` to swallow that would also swallow a broken *local*
 * route, which is the one thing this gate exists to catch. So the harness
 * records which origin each network error came from: an error attributable to a
 * third party makes the pixel comparison "not comparable" and skips out loud,
 * while an identical error from our own origin still fails the test.
 */
function watchThirdParty(page) {
  const origin = new URL(baseURL).origin;
  const errors = new Set();
  const isLocal = (url) => {
    try {
      return new URL(url).origin === origin;
    } catch {
      return false;
    }
  };
  page.on('requestfailed', (req) => {
    if (isLocal(req.url())) return;
    errors.add(req.failure()?.errorText || 'net::ERR_FAILED');
  });
  page.on('response', (res) => {
    if (res.status() < 400 || isLocal(res.url())) return;
    errors.add(`net::HTTP-${res.status()}`);
  });
  return {
    /** The console's generic resource-error line, if a third party caused it. */
    causedByThirdParty: (text) =>
      [...errors].some((e) => text === `Failed to load resource: ${e}`),
    isLocal,
    summary: () => [...errors].join(', '),
  };
}

/**
 * Frames the harness refused to compare during this run, filled by the baseline
 * tests and asserted by the budget test at the end of this file.
 *
 * The skip mechanism is honest but not free: a skipped baseline defends nothing,
 * so a run that skips most of its frames is a green light over an empty road.
 * Third-party media is outside our control, but how much of the visual contract
 * it is allowed to void is a decision, and decisions belong in an assertion.
 */
const nonComparable = [];
const NON_COMPARABLE_BUDGET = 4;

for (const route of ROUTES) {
  test.describe(route.path, () => {
    for (const viewport of VIEWPORTS) {
      test(`${viewport.name} renders without errors or horizontal scroll`, async ({ page }) => {
        const errors = [];
        const thirdParty = watchThirdParty(page);
        page.on('console', (msg) => {
          if (msg.type() !== 'error') return;
          const text = msg.text().replace(/\s+/g, ' ').trim();
          if (CONSOLE_NOISE.some((re) => re.test(text))) return;
          if (thirdParty.causedByThirdParty(text)) return;
          errors.push(text);
        });
        page.on('pageerror', (err) => errors.push(`PAGEERROR ${String(err.message || err)}`));
        // The console only says "Failed to load resource"; the response event
        // says which one, and a 404 on a route is a regression worth naming.
        // Third-party responses are excluded here for the same reason they are
        // excluded above: an external CDN's 404 is not our route table breaking.
        page.on('response', (res) => {
          if (res.status() >= 400 && thirdParty.isLocal(res.url())) {
            errors.push(`${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`);
          }
        });

        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await open(page, route);

        const unexplained = [...new Set(errors)].filter(
          (text) => !KNOWN_DEBT.some((re) => re.test(text)),
        );
        expect(unexplained, `${route.path} logged console errors`).toEqual([]);
        const overflow = await measureOverflow(page);
        expect(
          overflow.scrollWidth,
          `${route.path} @ ${viewport.width}x${viewport.height} scrolls horizontally — ${overflow.offenders.join(', ')}`,
        ).toBeLessThanOrEqual(overflow.clientWidth + 1);
        const debtKey = `${route.name}@${viewport.name}`;
        const debt = LAYOUT_DEBT[debtKey] || [];
        const unreachable = overflow.unreachable.filter((label) => !debt.includes(label));
        expect(
          unreachable,
          `${route.path} @ ${viewport.width}x${viewport.height} renders controls outside the viewport`,
        ).toEqual([]);
        // A debt entry that no longer reproduces is a fixed bug wearing a
        // leash: fail so it gets deleted instead of silently masking the next
        // control that overflows at this width.
        const stale = debt.filter((label) => !overflow.unreachable.includes(label));
        expect(
          stale,
          `${debtKey} lists resolved layout debt — remove ${stale.join(', ')}`,
        ).toEqual([]);
      });
    }

    for (const name of route.shot) {
      const viewport = VIEWPORTS.find((v) => v.name === name);
      test(`baseline ${viewport.width}x${viewport.height}`, async ({ page }) => {
        const thirdParty = watchThirdParty(page);
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await open(page, route);
        /**
         * Skipped, not forgiven: a frame missing pixels that no CSS of ours
         * owns cannot defend anything, and recording it would bake an external
         * CDN's outage into the baseline. The reason is printed, and every skip
         * is counted against `NON_COMPARABLE_BUDGET` below.
         */
        const external = thirdParty.summary();
        if (external) {
          nonComparable.push(`${route.name}@${name} — ${external}`);
          test.skip(true, `frame not comparable — third-party network errors: ${external}`);
        }
        await expect(page).toHaveScreenshot(`${route.name}-${name}.png`, {
          fullPage: true,
          // Product surfaces draw live data; a whole-page baseline is only
          // useful if it survives a credit balance changing under it.
          maxDiffPixelRatio: MOBILE_NAMES.has(name) ? 0.02 : 0.01,
        });
        /**
         * The page-level ratio above is a fraction of a tall fullPage frame, so
         * it is loose in absolute terms: the Image composer changing from a 40px
         * circle to a full-width button stayed under 1% and passed against a
         * stale baseline. The composer is the product's first-class component
         * (PART 14), so it is defended on its own, at a tolerance its size
         * actually deserves.
         */
        // `:visible` because four of the five flagship studios mount a second,
        // hidden composer tree; `.first()` alone matched the invisible one and
        // timed out on "element is not visible".
        const composer = page.locator('[data-prompt-composer]:visible');
        if ((await composer.count()) > 0) {
          await expect(composer.first()).toHaveScreenshot(
            `${route.name}-composer-${name}.png`,
            { maxDiffPixelRatio: 0.001 },
          );
        }
      });
    }
  });
}

/**
 * Declared last and honoured because the config pins `workers: 1` and
 * `fullyParallel: false`, so this file runs in declaration order.
 *
 * A skipped baseline defends nothing, and third-party media is not our
 * regression to catch — but how much of the visual contract an outage is
 * allowed to void is a decision, so it is asserted instead of assumed. Over
 * budget means either result media starts being served from our own origin
 * (which also fixes the CSP and hot-linking problems) or the run is not
 * evidence of anything.
 */
test('gate self-check: non-comparable frames within budget', () => {
  expect(
    nonComparable.length,
    `frames not compared this run:\n  ${nonComparable.join('\n  ')}`,
  ).toBeLessThanOrEqual(NON_COMPARABLE_BUDGET);
});
