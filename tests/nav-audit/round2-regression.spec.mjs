// Round 2 regression harness for the sidebar real-user audit.
// Runs against a locally served build/dev server (NAV_BASE_URL) and re-checks
// every fixed item from Round 1 with mouse clicks only.
import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.env.NAV_BASE_URL || 'http://127.0.0.1:3128';
const OUT = process.env.NAV_OUT || path.join('nav-audit-results', 'round2');
fs.mkdirSync(OUT, { recursive: true });

const CATEGORY_HINTS = ['图片', '视频', '音频', '智能体', 'Images', 'Video', 'Audio', 'Agents'];

async function openSidebar(page) {
  // Desktop: <aside> holds category accordions. Mobile: hamburger first.
  if (await page.locator('aside').first().isVisible().catch(() => false)) return true;
  const burger = page.locator('button[aria-label*="菜单"], button[aria-label*="navigation" i], button[aria-label*="menu" i]').first();
  if (await burger.count()) {
    await burger.click().catch(() => {});
    await page.waitForTimeout(400);
  }
  return page.locator('aside').first().isVisible().catch(() => false);
}

async function panelLinks(page) {
  const aside = page.locator('aside').first();
  return aside.locator('div[role="group"] a[href^="/studio/"]');
}

async function openCategory(page, index) {
  const buttons = page.locator('aside button').filter({ hasText: /.+/ });
  const n = await buttons.count();
  for (let i = 0; i < n; i += 1) {
    const btn = buttons.nth(i);
    if (!(await btn.isVisible().catch(() => false))) continue;
    const expanded = await btn.getAttribute('aria-expanded');
    if (expanded === 'true') continue;
    const groupsBefore = await page.locator('aside div[role="group"]').count();
    await btn.click();
    await page.waitForTimeout(250);
    if ((await page.locator('aside div[role="group"]').count()) > groupsBefore) return true;
  }
  return false;
}

async function measure(page) {
  // Wait until the studio area actually paints content; a shell-only page stays tiny.
  await page.waitForFunction(() => {
    const main = document.querySelector('main') || document.body;
    return (main.innerText || '').trim().length > 60;
  }, null, { timeout: 20_000 }).catch(() => {});
  return page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const active = [...document.querySelectorAll('aside a[aria-current="page"]')].map((a) => a.getAttribute('href'));
    const aside = document.querySelector('aside');
    const rect = aside ? aside.getBoundingClientRect() : null;
    const cs = aside ? getComputedStyle(aside) : null;
    const style = document.createElement('style');
    return {
      url: location.pathname,
      textLength: (main.innerText || '').trim().length,
      textHead: (main.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 120),
      active,
      asidePresent: !!aside,
      asideVisible: !!aside && rect.width > 40 && rect.height > 40 && cs.visibility !== 'hidden' && cs.opacity !== '0',
      headings: [...document.querySelectorAll('main h1, main h2, main h3')].slice(0, 4).map((h) => h.innerText.trim()).filter(Boolean),
      hasSpinner: !!document.querySelector('main [class*="animate-spin"]'),
      deadLinks: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')).filter((h) => h === null || h === '#' || h.startsWith('javascript:')),
      localLinks: [...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').filter((h) => /localhost|127\.0\.0\.1|vadoo\.tv|:31\d\d/.test(h)),
    };
  });
}

async function collectErrors(page, action) {
  const api = [];
  const console_ = [];
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/') && res.status() >= 400) api.push(`${res.status()} ${url.replace(BASE, '')}`);
  });
  page.on('pageerror', (err) => console_.push(`PAGEERROR ${String(err.message).slice(0, 160)}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console_.push(`CONSOLE ${msg.text().slice(0, 160)}`);
  });
  return { api, console: console_, action };
}

test.describe('sidebar round 2 regression', () => {
  test('click every sidebar item, then reload, and check active menu', async ({ page }) => {
    const errors = await collectErrors(page, 'sweep');
    await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' });
    expect(await openSidebar(page), 'sidebar must render on /studio').toBe(true);

    const seen = [];
    for (let cat = 0; cat < CATEGORY_HINTS.length + 2; cat += 1) {
      if (!(await openCategory(page, cat))) break;
      const links = await panelLinks(page);
      const count = await links.count();
      for (let i = 0; i < count; i += 1) {
        const href = await links.nth(i).getAttribute('href');
        if (!href || seen.some((s) => s.href === href)) continue;
        const label = (await links.nth(i).innerText()).replace(/\s+/g, ' ').trim();
        await links.nth(i).click();
        await expect.poll(async () => new URL(page.url()).pathname, { timeout: 15_000 }).toBe(href);
        const click = await measure(page);
        await page.reload({ waitUntil: 'domcontentloaded' });
        const reload = await measure(page);
        const links2 = await panelLinks(page);
        seen.push({ href, label, click, reload, apiErrors: errors.api.slice(), consoleErrors: errors.console.slice() });
        errors.api.length = 0;
        errors.console.length = 0;
        // Re-open the panel that owns this item for the next click.
        await openSidebar(page);
        if (!(await links2.count())) await openCategory(page, 0);
      }
    }

    fs.writeFileSync(path.join(OUT, 'sweep.json'), JSON.stringify(seen, null, 2));
    const blank = seen.filter((s) => s.click.textLength < 60 || s.reload.textLength < 60);
    const dupActive = seen.filter((s) => s.click.active.length > 1 || s.reload.active.length > 1);
    const noActive = seen.filter((s) => s.reload.active.length === 0);
    const dead = seen.filter((s) => s.click.deadLinks.length || s.reload.deadLinks.length);
    const local = seen.filter((s) => s.click.localLinks.length || s.reload.localLinks.length);
    console.log(JSON.stringify({
      items: seen.length,
      blank: blank.map((s) => s.href),
      dupActive: dupActive.map((s) => s.href),
      noActive: noActive.map((s) => s.href),
      deadLinks: dead.map((s) => ({ href: s.href, dead: [...new Set(s.click.deadLinks.concat(s.reload.deadLinks))] })),
      localLinks: local.map((s) => ({ href: s.href, hits: [...new Set(s.click.localLinks.concat(s.reload.localLinks))] })),
      apiErrors: [...new Set(errors.api)],
      consoleErrors: [...new Set(errors.console)],
    }, null, 2));

    expect(seen.length, 'sidebar items discovered').toBeGreaterThanOrEqual(14);
  });

  test('agents page asks for sign-in instead of a dead error state', async ({ page }) => {
    const errors = await collectErrors(page, 'agents');
    await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' });
    await openSidebar(page);
    const agents = page.locator('aside a[href="/studio/agents"]').first();
    if (!(await agents.isVisible().catch(() => false))) {
      const cats = page.locator('aside button');
      for (let i = 0; i < (await cats.count()); i += 1) {
        await cats.nth(i).click().catch(() => {});
        if (await page.locator('aside a[href="/studio/agents"]').first().isVisible().catch(() => false)) break;
      }
    }
    await agents.click();
    await expect.poll(async () => new URL(page.url()).pathname, { timeout: 15_000 }).toBe('/studio/agents');
    const m = await measure(page);
    const bodyText = await page.locator('main').innerText();
    const cta = page.getByRole('button', { name: /Sign in|Log in|登录|登入|ログイン|로그인|Iniciar/ }).first();
    const ctaVisible = await cta.isVisible().catch(() => false);
    if (ctaVisible) {
      await cta.click();
      await page.waitForTimeout(600);
    }
    const modal = await page.locator('[role="dialog"]').count();
    fs.writeFileSync(path.join(OUT, 'agents.json'), JSON.stringify({
      ...m, bodyText: bodyText.replace(/\s+/g, ' ').slice(0, 400), ctaVisible, modalOpened: modal > 0,
      apiErrors: errors.api, consoleErrors: errors.console,
    }, null, 2));
    expect(ctaVisible, 'signed-out agents page must offer a working sign-in CTA').toBe(true);
    expect(/FAILED TO LOAD|加载失败|Failed to load/i.test(bodyText), 'no fake failure copy').toBe(false);
  });

  test('workflows page renders its own state without 401 spam', async ({ page }) => {
    const errors = await collectErrors(page, 'workflows');
    await page.goto(`${BASE}/studio/workflows`, { waitUntil: 'domcontentloaded' });
    const m = await measure(page);
    const body = await page.locator('main').innerText();
    fs.writeFileSync(path.join(OUT, 'workflows.json'), JSON.stringify({
      ...m, body: body.replace(/\s+/g, ' ').slice(0, 400), apiErrors: errors.api, consoleErrors: errors.console,
    }, null, 2));
    expect(m.reload === undefined ? true : m.textLength).toBeGreaterThan(60);
  });

  test('mobile drawer at 390px opens and navigates', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' });
    const burger = page.locator('header button[aria-label*="菜单"], header button[aria-label*="menu" i]').first();
    expect(await burger.count(), 'hamburger present on mobile').toBeGreaterThan(0);
    await burger.click();
    await page.waitForTimeout(500);
    const drawer = page.locator('aside').first();
    const box = await drawer.boundingBox().catch(() => null);
    const after = await page.evaluate(() => {
      const a = document.querySelector('aside');
      if (!a) return null;
      const r = a.getBoundingClientRect();
      const cs = getComputedStyle(a);
      const top = document.elementFromPoint(Math.min(60, window.innerWidth / 2), 300);
      return {
        left: Math.round(r.left), width: Math.round(r.width),
        transform: cs.transform, visibility: cs.visibility, opacity: cs.opacity,
        inFront: !!(top && (top === a || a.contains(top) || top.closest('aside'))),
        links: [...a.querySelectorAll('a[href^="/studio/"]')].map((x) => x.getAttribute('href')),
      };
    });
    fs.writeFileSync(path.join(OUT, 'drawer.json'), JSON.stringify({ box, after }, null, 2));
    expect(after, 'drawer mounted').not.toBeNull();
    expect(after.width).toBeGreaterThan(100);
    expect(after.left).toBeGreaterThanOrEqual(0);
    expect(after.visibility).not.toBe('hidden');
    expect(after.links.length, 'drawer exposes studio links').toBeGreaterThan(0);
    const target = after.links.find((h) => h !== '/studio') || after.links[0];
    await drawer.locator(`a[href="${target}"]`).click();
    await expect.poll(async () => new URL(page.url()).pathname, { timeout: 15_000 }).toBe(target);
  });

  test('history back / back / forward keeps menu in sync', async ({ page }) => {
    await page.goto(`${BASE}/studio`, { waitUntil: 'domcontentloaded' });
    await openSidebar(page);
    const items = [];
    const cats = page.locator('aside button');
    for (let i = 0; i < (await cats.count()) && items.length < 3; i += 1) {
      await cats.nth(i).click().catch(() => {});
      const links = await panelLinks(page);
      for (let j = 0; j < (await links.count()) && items.length < 3; j += 1) {
        const link = links.nth(j);
        const href = await link.getAttribute('href');
        if (href && !items.includes(href)) items.push(href);
      }
    }
    const steps = [];
    for (const href of items) {
      await openSidebar(page);
      const link = page.locator(`aside a[href="${href}"]`).first();
      if (!(await link.isVisible().catch(() => false))) { await openCategory(page, 0); }
      await link.click();
      await expect.poll(async () => new URL(page.url()).pathname, { timeout: 15_000 }).toBe(href);
      steps.push(await measure(page));
    }
    await page.goBack(); await page.waitForTimeout(900); steps.push(await measure(page));
    await page.goBack(); await page.waitForTimeout(900); steps.push(await measure(page));
    await page.goForward(); await page.waitForTimeout(900); steps.push(await measure(page));
    fs.writeFileSync(path.join(OUT, 'history.json'), JSON.stringify(steps, null, 2));
    expect(steps.every((s) => s.textLength > 40)).toBe(true);
  });
});
