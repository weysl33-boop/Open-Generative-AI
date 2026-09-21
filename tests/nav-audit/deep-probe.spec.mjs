import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

// Deep probe for the items the sweep flagged: blank pages, the agents error
// state, and the mobile drawer. Captures every request (not only /api) and a
// screenshot, so a "blank" reading can be told apart from a measurement artifact.

const BASE = process.env.NAV_BASE_URL || 'https://www.koyosim.com';
const OUT = process.env.NAV_PROBE_DIR || path.join('nav-audit-results', 'probe');
const BLANK = ['/studio/motion-control', '/studio/lipsync', '/studio/body-swap'];

test.describe.configure({ mode: 'serial' });

async function probe(page, href) {
  const reqs = [];
  const errs = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errs.push(m.text().replace(/\s+/g, ' ').slice(0, 300));
  });
  page.on('request', (r) => {
    if (/\.(js|css|png|jpg|svg|woff2?|ico|map)(\?|$)/.test(r.url())) return;
    reqs.push(r.method() + ' ' + r.url().replace(/^https?:\/\/[^/]+/, ''));
  });
  page.on('response', async (res) => {
    const u = res.url();
    if (!u.includes('/api/')) return;
    let body = '';
    if (res.status() >= 400) body = (await res.text().catch(() => ''))
      .replace(/\s+/g, ' ').slice(0, 160);
    reqs.push('RESP ' + res.status() + ' ' + u.replace(/^https?:\/\/[^/]+/, '') + (body ? ' :: ' + body : ''));
  });

  await page.goto(BASE + href, { waitUntil: 'networkidle', timeout: 45_000 }).catch(() => {});
  await page.waitForTimeout(2500);

  const dom = await page.evaluate(() => {
    const main = document.querySelector('main') || document.body;
    const walk = (el, d = 0) => {
      if (d > 6) return '';
      return [...el.children]
        .map((c) => {
          const txt = (c.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 70);
          const box = c.getBoundingClientRect();
          return '  '.repeat(d) + `<${c.tagName.toLowerCase()} class="${(c.className || '').toString().slice(0, 60)}" w=${Math.round(box.width)} h=${Math.round(box.height)}>${txt ? ' ' + txt : ''}\n` + walk(c, d + 1);
        })
        .join('');
    };
    return {
      bodyText: (document.body.innerText || '').replace(/\s+/g, ' ').trim(),
      html: main.innerHTML.length,
      tree: walk(main).slice(0, 2600),
      errorBoundary: /something went wrong|application error|reload|重试/i.test(document.body.innerText || ''),
      asidePresent: !!document.querySelector('aside nav'),
    };
  });
  const name = href.replace(/\W/g, '_') + '_click';
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: false }).catch(() => {});
  return { href, dom, requests: reqs, consoleErrors: errs };
}

test('blank routes: motion-control / lipsync / body-swap', async ({ page }) => {
  test.setTimeout(240_000);
  fs.mkdirSync(OUT, { recursive: true });
  const out = [];
  for (const href of BLANK) out.push(await probe(page, href));
  fs.writeFileSync(path.join(OUT, 'blank.json'), JSON.stringify(out, null, 2));
  for (const o of out) {
    expect(o.dom.bodyText.length, o.href + ' must render content').toBeGreaterThan(40);
  }
});

test('agents: FAILED TO LOAD root cause', async ({ page }) => {
  test.setTimeout(90_000);
  fs.mkdirSync(OUT, { recursive: true });
  const r = await probe(page, '/studio/agents');
  fs.writeFileSync(path.join(OUT, 'agents.json'), JSON.stringify(r, null, 2));
  expect(r.dom.bodyText, 'agents page shows an error state').not.toMatch(/FAILED TO LOAD/i);
});

test('mobile drawer at 390 must open and navigate', async ({ page}) => {
  test.setTimeout(90_000);
  fs.mkdirSync(OUT, { recursive: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/studio', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  const before = await page.evaluate(() => {
    const a = document.querySelector('aside');
    const r = a?.getBoundingClientRect();
    return { present: !!a, left: r ? Math.round(r.left) : null, w: r ? Math.round(r.width) : null, vw: innerWidth };
  });
  const btn = page.locator('header button[aria-label*="Navigation" i], header button[aria-label*="menu" i], button[aria-label*="导航"]').first();
  const label = (await btn.count()) ? await btn.getAttribute('aria-label') : null;
  let clicked = false;
  if (await btn.count()) { await btn.click({ timeout: 5000 }).catch(() => {}); clicked = true; }
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => {
    const a = document.querySelector('aside');
    const r = a?.getBoundingClientRect();
    const nav = document.querySelector('aside nav');
    return {
      left: r ? Math.round(r.left) : null,
      visible: !!a && !!a.offsetParent && getComputedStyle(a).visibility !== 'hidden',
      opacity: a ? getComputedStyle(a).opacity : null,
      transform: a ? getComputedStyle(a).transform : null,
      links: nav ? nav.querySelectorAll('a[href]').length : 0,
      backdrop: !!document.querySelector('.fixed.inset-0.z-40, [aria-label*="backdrop" i], [role=dialog]'),
    };
  });
  await page.screenshot({ path: path.join(OUT, 'drawer_390_after.png') }).catch(() => {});
  // If the drawer did open, prove a menu item actually works from it.
  let navigated = null;
  if (after.visible && after.left >= 0 && after.links) {
    const first = page.locator('aside nav a[href^="/studio/"]').first();
    const href = await first.getAttribute('href');
    await first.click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(1500);
    navigated = { href, url: new URL(page.url()).pathname };
  }
  fs.writeFileSync(path.join(OUT, 'drawer.json'), JSON.stringify({ before, toggleLabel: label, clicked, after, navigated }, null, 2));
  expect(after.visible && after.left >= 0, 'sidebar drawer must open on mobile').toBe(true);
});
