import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

// Real-user sidebar sweep: every left-menu entry is opened with a mouse click,
// then the route, rendered content, active highlight, console output, /api
// traffic and post-reload state are recorded. Nothing here stubs or mocks the
// app: an entry that renders nothing is reported as blank, not papered over.

// Not test-results/: Playwright empties that directory when a run starts.
const REPORT = process.env.NAV_REPORT || path.join('nav-audit-results', 'sidebar.json');
const results = { base: '', navMap: [], items: [], history: [], responsive: [], links: [] };

function writeReport() {
  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(results, null, 2));
}

// The sidebar accordion mounts only the open group's panel, so reaching an item
// requires opening its owner first — and opening an already-closed group must
// never collapse one that is already open.
async function openItem(page, href, group) {
  return page.evaluate(
    async ({ target, group: wantGroup }) => {
      const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const nav = document.querySelector('aside nav');
      if (!nav) return { status: 'no-nav' };
      const panelOf = (b) => document.getElementById(b.getAttribute('aria-controls'));
      const labelled = [...nav.querySelectorAll('button[aria-controls]')].filter(
        (b) => !wantGroup || (b.getAttribute('aria-label') || '').trim() === wantGroup,
      );
      const others = [...nav.querySelectorAll('button[aria-controls]')].filter((b) => !labelled.includes(b));
      for (const b of [...labelled, ...others]) {
        if (b.getAttribute('aria-expanded') !== 'true' && !panelOf(b)) {
          b.click();
          await sleep(240);
        }
        const panel = panelOf(b);
        if (panel && panel.querySelector(`a[href="${target}"]`)) {
          return { status: 'opened', panelId: panel.id, owner: b.getAttribute('aria-label') };
        }
        if (b.getAttribute('aria-expanded') !== 'true') continue;
      }
      return { status: 'owner-not-found' };
    },
    { target: href, group: group === '(standalone)' ? '' : group },
  );
}

async function collectNavMap(page) {
  return page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const nav = document.querySelector('aside nav');
    if (!nav) return [];
    const found = [];
    for (const b of nav.querySelectorAll('button[aria-controls]')) {
      const group = b.getAttribute('aria-label') || '';
      let panel = document.getElementById(b.getAttribute('aria-controls'));
      if (!panel) {
        b.click();
        await sleep(200);
        panel = document.getElementById(b.getAttribute('aria-controls'));
      }
      for (const a of [...(panel ? panel.querySelectorAll('a[href]') : [])]) {
        found.push({ group, href: a.getAttribute('href'), label: a.innerText.trim() });
      }
    }
    for (const a of nav.querySelectorAll('a[href]')) {
      if (a.closest('[role=group]')) continue;
      const href = a.getAttribute('href');
      if (!found.some((f) => f.href === href)) {
        found.push({ group: '(standalone)', href, label: a.getAttribute('aria-label') || a.innerText.trim() });
      }
    }
    return found;
  });
}

async function measure(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('aside nav');
    const wrappers = [...document.querySelectorAll('div')].filter(
      (d) => /\bh-full\b/.test(d.className) && /\bw-full\b/.test(d.className) && !/\bhidden\b/.test(d.className) && d.offsetParent,
    );
    const root = wrappers[wrappers.length - 1] || document.querySelector('main') || document.body;
    const text = (root.innerText || '').replace(/\s+/g, ' ').trim();
    const visibleButtons = [...root.querySelectorAll('button')].filter((b) => b.offsetParent);
    const bad = [];
    for (const a of document.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href');
      if (href === '#' || href === '' || /^javascript:/i.test(href) || /localhost|127\.0\.0\.1/.test(href)) {
        bad.push({ href, text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 40) });
      }
    }
    return {
      url: location.pathname,
      textLength: text.length,
      sample: text.slice(0, 200),
      inputs: root.querySelectorAll('input,textarea,select').length,
      buttons: visibleButtons.length,
      buttonLabels: visibleButtons.map((b) => b.innerText.trim()).filter(Boolean).slice(0, 12),
      activeItems: nav ? [...nav.querySelectorAll('a[aria-current="page"]')].map((a) => a.getAttribute('href')) : [],
      parentGroupExpanded: nav ? !!nav.querySelector('[role=group] a[aria-current="page"]') : false,
      activeCategories: nav ? [...nav.querySelectorAll('button[aria-controls]')].filter((b) => /border-brand-line/.test(b.className)).map((b) => b.getAttribute('aria-label')) : [],
      brokenLinks: bad.slice(0, 8),
    };
  });
}

test('sidebar: every menu item clicked, rendered, active and reload-stable', async ({ page }) => {
  test.setTimeout(300_000);
  results.base = page.url();

  const consoleErrors = [];
  const apiCalls = [];
  let current = 'boot';
  let hardLoads = 0;
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text().replace(/\s+/g, ' ').slice(0, 220);
    if (/favicon|Download the React DevTools|Failed to load resource: the server responded/i.test(text)) return;
    consoleErrors.push({ at: current, text });
  });
  page.on('response', (res) => {
    const url = res.url();
    if (!url.includes('/api/')) return;
    apiCalls.push({ at: current, api: url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90), status: res.status() });
  });
  page.on('requestfailed', (req) => {
    const url = req.url();
    if (!url.includes('/api/')) return;
    apiCalls.push({ at: current, api: url.replace(/^https?:\/\/[^/]+/, '').slice(0, 90), status: 'FAILED' });
  });
  page.on('load', () => {
    hardLoads += 1;
  });

  await page.goto('/studio', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('aside nav', { timeout: 30_000 });
  results.base = page.url();
  const bootLoads = hardLoads;

  const navMap = await collectNavMap(page);
  results.navMap = navMap;
  expect(navMap.length, 'sidebar must expose at least one menu item').toBeGreaterThan(0);
  writeReport();

  for (const entry of navMap) {
    current = entry.href;
    consoleErrors.length = 0;
    apiCalls.length = 0;
    const loadsBefore = hardLoads;

    // Some pages (design-agent) unmount the whole sidebar; recover before the
    // next click so one chrome-hiding page cannot blind the rest of the sweep.
    let recoveredFrom = null;
    if (!(await page.locator('aside nav').count())) {
      recoveredFrom = new URL(page.url()).pathname;
      await page.goto('/studio', { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('aside nav', { timeout: 20_000 }).catch(() => {});
    }
    // Survives soft navigation, is wiped by a real document load: the only
    // reliable way to tell pushState from a full page reload.
    await page.evaluate(() => {
      window.__navMarker = 'alive';
    });
    const open = await openItem(page, entry.href, entry.group);
    const scoped = open.panelId ? `#${open.panelId} a[href="${entry.href}"]` : `aside nav a[href="${entry.href}"]`;
    await page.waitForSelector(scoped, { timeout: 5_000 }).catch(() => {});

    const link = page.locator(scoped).first();
    const clickOk = (await link.count()) > 0;
    if (clickOk) await link.click({ timeout: 5_000 }).catch(() => {});
    const navigated = await page
      .waitForFunction((href) => location.pathname === href, entry.href, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(1_400);
    // Sampled BEFORE the deliberate reload below, or the counter is meaningless.
    const loadsAfterClick = hardLoads;
    const markerSurvived = await page.evaluate(() => window.__navMarker === 'alive');

    const after = clickOk ? await measure(page) : { url: page.url(), note: 'LINK NOT FOUND' };
    if (!navigated) after.note = `CLICK DID NOT NAVIGATE (opened=${open.status}/${open.owner || '-'}, landed=${page.url()})`;

    // Reload must not lose the route or the highlight.
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForSelector('aside nav', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(1_200);
    const reloaded = await measure(page);

    results.items.push({
      group: entry.group,
      label: entry.label,
      href: entry.href,
      clicked: clickOk,
      navigated,
      ownerGroup: open.owner || null,
      sidebarMissingBefore: recoveredFrom,
      click: after,
      reload: reloaded,
      consoleErrors: consoleErrors.slice(),
      api: apiCalls.slice(),
      hardNavigationOnClick: loadsAfterClick > loadsBefore || !markerSurvived,
    });
    writeReport();
  }
  results.bootLoads = bootLoads;
  results.hardLoads = hardLoads;

  const anchors = await page.evaluate(() =>
    [...document.querySelectorAll('a[href]')].map((a) => ({
      href: a.getAttribute('href'),
      text: (a.innerText || a.getAttribute('aria-label') || '').trim().slice(0, 40),
      target: a.getAttribute('target'),
    })),
  );
  results.links = anchors.filter((a) =>
    /^#|^$|^javascript:/i.test(a.href ?? '') ||
    /localhost|127\.0\.0\.1/.test(a.href ?? '') ||
    (a.href?.startsWith('http') && !a.href.startsWith('https://www.koyosim.com') && !a.href.startsWith('mailto:')),
  );
  writeReport();
});

test('history: back / forward keeps page, url and highlight in sync', async ({ page }) => {
  test.setTimeout(180_000);
  const chain = ['/studio/image', '/studio/video', '/studio/audio'];
  await page.goto('/studio', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('aside nav', { timeout: 20_000 });
  const visited = [];
  for (const href of chain) {
    await openItem(page, href);
    const link = page.locator(`aside nav a[href="${href}"]`).first();
    if (await link.count()) await link.click({ timeout: 5_000 }).catch(() => {});
    const ok = await page
      .waitForFunction((h) => location.pathname === h, href, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    await page.waitForTimeout(1_200);
    visited.push({ href, navigated: ok, landed: page.url() });
  }
  results.historyVisited = visited;
  // Back/forward only mean anything if the clicks really built a history stack.
  expect(visited.filter((v) => v.navigated).length, 'at least two clicks must navigate').toBeGreaterThanOrEqual(2);

  for (const step of [
    { name: 'back', fn: () => page.goBack() },
    { name: 'back2', fn: () => page.goBack() },
    { name: 'forward', fn: () => page.goForward() },
  ]) {
    await step.fn().catch(() => {});
    await page.waitForTimeout(1_600);
    const m = await measure(page);
    results.history.push({ step: step.name, ...m });
    writeReport();
  }
  writeReport();
});

test('responsive: sidebar usable at 1920/1440/1280/1024/768/390', async ({ page }) => {
  test.setTimeout(180_000);
  for (const width of [1920, 1440, 1280, 1024, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/studio', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('aside nav', { timeout: 20_000 }).catch(() => {});
    await page.waitForTimeout(800);
    const probe = await page.evaluate(() => {
      const aside = document.querySelector('aside');
      const nav = document.querySelector('aside nav');
      const first = nav && nav.querySelector('a[href], button');
      const rect = aside ? aside.getBoundingClientRect() : null;
      const clipped = aside ? [...aside.querySelectorAll('span')].filter((s) => s.scrollWidth > s.clientWidth + 2 && getComputedStyle(s).overflow === 'hidden').length : 0;
      return {
        asideVisible: !!aside && !!aside.offsetParent,
        asideLeft: rect ? Math.round(rect.left) : null,
        asideWidth: rect ? Math.round(rect.width) : null,
        coversContent: rect ? rect.left < 0 : null,
        offScreen: rect ? rect.right < 0 || rect.left > innerWidth : null,
        firstItemVisible: !!first && !!first.offsetParent,
        clippedLabels: clipped,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
        viewport: innerWidth,
      };
    });
    // On <md the drawer is translated off-canvas by design; the hamburger must
    // really open it, so click it and re-measure rather than trusting presence.
    let drawer = { needed: !probe.asideVisible || probe.offScreen };
    if (drawer.needed) {
      const toggles = page.locator('header button');
      const n = await toggles.count();
      let opened = false;
      for (let i = 0; i < n && !opened; i += 1) {
        const t = toggles.nth(i);
        const label = `${(await t.getAttribute('aria-label').catch(() => '')) || ''} ${(await t.getAttribute('title').catch(() => '')) || ''}`;
        if (!/导航|菜单|navigation|menu/i.test(label)) continue;
        await t.click({ timeout: 4_000 }).catch(() => {});
        await page.waitForTimeout(700);
        const after = await page.evaluate(() => {
          const a = document.querySelector('aside');
          if (!a || !a.offsetParent) return { visible: false };
          const r = a.getBoundingClientRect();
          return { visible: r.left >= 0 && r.width > 0, left: Math.round(r.left), links: a.querySelectorAll('a[href]').length };
        });
        opened = !!after.visible;
        drawer = { needed: true, toggleLabel: label.trim(), opened, ...after };
      }
      if (!drawer.toggleLabel) drawer.opened = false;
    }
    results.responsive.push({ width, ...probe, drawer });
    writeReport();
  }
  writeReport();
});
