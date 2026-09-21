#!/usr/bin/env node
/**
 * Runtime UI-spec drift audit for the live site.
 *
 * The contract is the token block in app/globals.css, which tailwind.config.js
 * declares to be the single source of truth. Literal values quoted in
 * docs/UI_DESIGN_SYSTEM.md are subordinate to it.
 *
 * Findings are keyed by a stable signature, so repeated runs only report what
 * is NEW or has REGRESSED against the baseline in .ui-drift/state.json.
 *
 * Read-only by construction: the audit never submits a form, never clicks a
 * control and never triggers a generation. It only reads computed styles and
 * calls element.focus().
 *
 * Usage:
 *   node scripts/ui-spec-audit.mjs
 *   node scripts/ui-spec-audit.mjs --tier front --limit 8
 *   UI_AUDIT_KO_SESSION=<token> node scripts/ui-spec-audit.mjs --tier admin
 *
 * /admin coverage needs a live ko_session cookie: put it in .env.local as
 * UI_AUDIT_KO_SESSION (or export it) and the audit stops skipping /admin.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { chromium } from 'playwright';

const ROOT = process.cwd();
const STATE_DIR = path.join(ROOT, '.ui-drift');
const RUNS_DIR = path.join(STATE_DIR, 'runs');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const KEEP_RUNS = 24;
// Only this one key is read from the dotenv files, and only when the shell did
// not already set it. Loading the whole file would hand every secret in
// .env.local to a process that puts its traffic (and its session cookie) on the
// wire to a public host.
const SESSION_KEYS = ['UI_AUDIT_KO_SESSION'];
const ENV_FILES = ['.env.local', '.env'];
// A signature absent for this many consecutive runs counts as fixed, so a later
// reappearance is reported as a regression instead of being silently absorbed.
const FIXED_AFTER_ABSENT_RUNS = 2;

const STUDIO_TABS = [
  'image', 'headshot', 'layers', 'video', 'audio', 'clipping', 'motion-control',
  'vibe-motion', 'lipsync', 'body-swap', 'cinema', 'marketing', 'workflows',
  'agents', 'design-agent', 'apps', 'ai-influencer',
];
const SKIP_PATTERNS = [/^\/api(\/|$)/, /^\/robots/, /^\/sitemap/, /^\/favicon/];
const LOCALE_ROOTS = ['zh-CN', 'zh-TW', 'ja-JP', 'ko-KR', 'es', 'zh'];

const RULES = {
  color_off_token: { severity: 'P1', what: '渲染色值无法解析自任何 token' },
  glow_neon_shadow: { severity: 'P1', what: '霓虹发光阴影，规范红线禁止' },
  h_overflow: { severity: 'P1', what: '该视口下页面出现横向溢出' },
  focus_indicator_missing: { severity: 'P1', what: '可交互控件缺少可见焦点态' },
  route_unreachable: { severity: 'P1', what: '路由返回 4xx/5xx' },
  radius_off_scale: { severity: 'P2', what: '圆角越出 6 级语义圆角' },
  control_height_off_contract: { severity: 'P2', what: '控件高度不符合高度契约' },
  font_size_off_scale: { severity: 'P2', what: '字号不在字阶梯度内' },
  z_index_off_ladder: { severity: 'P2', what: 'z-index 越出层级契约' },
  native_scrollbar_visible: { severity: 'P2', what: '滚动容器暴露原生滚动条' },
  icon_button_no_accessible_name: { severity: 'P2', what: '图标按钮缺少无障碍名称' },
  touch_target_small: { severity: 'P2', what: '移动端点击热区小于 32px' },
  route_redirected_offsite: { severity: 'P2', what: '路由被重定向离开本站' },
  route_landing_mismatch: { severity: 'P2', what: '请求的路由被客户端重定向到了别的页面' },
  line_height_off_scale: { severity: 'P3', what: '行高与字号不成套' },
  shadow_off_contract: { severity: 'P3', what: '阴影不是 elevation token' },
  motion_off_scale: { severity: 'P3', what: '过渡时长不在 motion token 内' },
  font_family_off_stack: { severity: 'P3', what: '字体栈偏离全局声明' },
  sample_error: { severity: 'P1', what: '该页采样失败，本轮结论不完整' },
};
const SEVERITIES = ['P1', 'P2', 'P3'];

/* -------------------------------------------------------------------- util */

const round3 = (n) => Math.round(n * 1000) / 1000;

/**
 * Pull the audit's own keys out of the project dotenv files. An inline
 * `KEY=value` always wins, so CI and one-off runs stay authoritative.
 */
function loadSessionFromEnvFiles() {
  for (const key of SESSION_KEYS) {
    if (process.env[key]) continue;
    for (const file of ENV_FILES) {
      const abs = path.join(ROOT, file);
      let raw;
      try {
        raw = fs.readFileSync(abs, 'utf8');
      } catch {
        continue;
      }
      for (const line of raw.split(/\r?\n/)) {
        const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
        if (!m || m[1] !== key) continue;
        const value = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
        if (value) {
          process.env[key] = value;
          console.log(`! 已从 ${file} 读取 ${key}`);
        }
        break;
      }
      if (process.env[key]) break;
    }
  }
}

function parseColor(raw) {
  if (!raw) return null;
  const v = String(raw).trim();
  let m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(v);
  if (m) {
    let n = m[1];
    if (n.length === 3) n = n.split('').map((c) => c + c).join('');
    return {
      r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16), a: 1,
    };
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(v);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (parts.length >= 3 && parts.every(Number.isFinite)) {
      let a = parts[3] === undefined ? 1 : parts[3];
      if (a > 1) a /= 100; // tolerate `45%`
      return { r: parts[0], g: parts[1], b: parts[2], a };
    }
  }
  return null;
}

const fmtColor = (c) => (c.a >= 0.999
  ? `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`
  : `rgba(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)} ${round3(c.a)})`);

/**
 * Canonicalise one box-shadow layer. Chrome serialises the colour first and
 * pads an omitted spread with `0px`, so neither matches the authored token
 * textually; reduce both to `offsets|color` instead.
 */
function normalizeShadowLayer(layer) {
  let text = String(layer).replace(/\s+/g, ' ').trim();
  if (!text || text === 'none') return null;
  const inset = /(^|\s)inset(\s|$)/.test(text);
  text = text.replace(/\binset\b/g, ' ');
  let color = 'none';
  const cm = /rgba?\([^)]*\)|#[0-9a-fA-F]{3,8}\b/.exec(text);
  if (cm) {
    const parsed = parseColor(cm[0]);
    if (parsed) color = fmtColor(parsed);
    text = text.replace(cm[0], ' ');
  }
  const nums = (text.match(/-?[\d.]+(?:px|%)?/g) || []).map(parseFloat).filter(Number.isFinite);
  while (nums.length < 4) nums.push(0);
  return `${inset ? 'i' : ''}${nums.slice(0, 4).map(round3).join(' ')}|${color}`;
}

function normalizeShadow(shadow) {
  if (!shadow || shadow === 'none') return [];
  return shadow
    .split(/,(?![^(]*\))/)
    .map((l) => normalizeShadowLayer(l))
    .filter(Boolean);
}

/* ------------------------------------------------------------------ tokens */

function loadContract() {
  const css = fs.readFileSync(path.join(ROOT, 'app', 'globals.css'), 'utf8');
  const block = /:root\s*\{([\s\S]*?)\n\}/.exec(css);
  if (!block) throw new Error('app/globals.css 中找不到 :root token 区块');
  const body = block[1].replace(/\/\*[\s\S]*?\*\//g, '');
  const decls = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decls[m[1]] = m[2].trim();

  const colors = [];
  for (const [name, value] of Object.entries(decls)) {
    for (const m of value.matchAll(/#[0-9a-fA-F]{3,8}\b|rgba?\([^)]+\)/g)) {
      const parsed = parseColor(m[0]);
      if (parsed) colors.push({ r: parsed.r, g: parsed.g, b: parsed.b, a: round3(parsed.a), token: name.slice(2) });
    }
  }
  const px = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : null);
  const numeric = (prefix, filter = () => true) => Object.entries(decls)
    .filter(([k]) => k.startsWith(prefix))
    .map(([, v]) => px(v))
    .filter((v) => v !== null && filter(v))
    .sort((a, b) => a - b);

  const heights = [...numeric('--control-'), px(decls['--header-h'])].filter((v) => v !== null).sort((a, b) => a - b);
  return {
    colors,
    radius: [...numeric('--radius-'), 0].sort((a, b) => a - b),
    heights,
    fontSizes: numeric('--text-', (v) => v >= 8 && v <= 80),
    lineHeights: [...numeric('--lh-'), 0],
    zIndex: numeric('--z-'),
    durations: numeric('--motion-'),
    elevationLayers: [...new Set(Object.entries(decls)
      .filter(([k]) => k.startsWith('--elevation-'))
      .flatMap(([, v]) => normalizeShadow(v)))],
    fontMono: decls['--font-mono'] || '',
  };
}

/* ------------------------------------------------------------------ routes */

function routesFromApp(tiers, locales) {
  const appDir = path.join(ROOT, 'app');
  const pages = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') walk(abs);
      } else if (/^page\.[jt]sx?$/.test(entry.name)) {
        pages.push(abs);
      }
    }
  };
  walk(appDir);

  const routes = new Map();
  for (const abs of pages) {
    const segments = path.relative(appDir, abs).split(path.sep).slice(0, -1);
    const parts = [];
    let localeScoped = false;
    let unusable = false;
    for (const seg of segments) {
      if (seg.startsWith('(') && seg.endsWith(')')) continue;
      if (seg.startsWith('[[') && seg.endsWith(']]')) continue; // optional catch-all renders at its base path
      if (seg.startsWith('[') && seg.endsWith(']')) {
        const name = seg.slice(1, -1).replace(/^\.{3}/, '');
        if (name === 'locale' || LOCALE_ROOTS.includes(name)) localeScoped = true;
        else unusable = true; // a required param whose value we cannot fabricate
        continue;
      }
      if (LOCALE_ROOTS.includes(seg)) localeScoped = true;
      parts.push(seg);
    }
    if (localeScoped || unusable) continue;
    const urlPath = parts.length ? `/${parts.join('/')}` : '/';
    if (SKIP_PATTERNS.some((re) => re.test(urlPath))) continue;
    const tier = urlPath.startsWith('/admin') ? 'admin' : urlPath.startsWith('/studio') ? 'studio' : 'front';
    routes.set(urlPath, { path: urlPath, tier });
  }
  if (tiers.includes('studio')) {
    for (const tab of STUDIO_TABS) routes.set(`/studio/${tab}`, { path: `/studio/${tab}`, tier: 'studio' });
  }

  let out = [...routes.values()].filter((r) => tiers.includes(r.tier));
  if (locales.length) {
    const extra = out
      .filter((r) => r.tier === 'front')
      .flatMap((r) => locales.map((loc) => ({ ...r, path: `/${loc}${r.path === '/' ? '' : r.path}`, locale: loc })));
    out = [...out, ...extra];
  }
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

/* ---------------------------------------------------------------- sampling */

/**
 * Runs in the page. Everything it needs is passed in or defined locally,
 * because Playwright serialises only this function's source.
 */
function samplePage({ contract, viewportName }) {
  const hits = [];
  const note = (rule, value, sample, count = 1) => hits.push({ rule, value, sample: sample || '', count });

  const parse = (raw) => {
    if (!raw) return null;
    const v = String(raw).trim();
    let m = /^#([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(v);
    if (m) {
      let n = m[1];
      if (n.length === 3) n = n.split('').map((c) => c + c).join('');
      return { r: parseInt(n.slice(0, 2), 16), g: parseInt(n.slice(2, 4), 16), b: parseInt(n.slice(4, 6), 16), a: 1 };
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(v);
    if (!m) return null;
    const p = m[1].split(/[,/\s]+/).filter(Boolean).map(Number);
    if (p.length < 3 || !p.every(Number.isFinite)) return null;
    let a = p[3] === undefined ? 1 : p[3];
    if (a > 1) a /= 100;
    return { r: p[0], g: p[1], b: p[2], a };
  };
  const show = (c) => (c.a >= 0.999
    ? `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`
    : `rgba(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)} ${Math.round(c.a * 1000) / 1000})`);
  const onToken = (c) => !c || c.a <= 0.004 || contract.colors.some((t) => Math.abs(t.r - c.r) <= 1
    && Math.abs(t.g - c.g) <= 1 && Math.abs(t.b - c.b) <= 1 && Math.abs(t.a - c.a) <= 0.012);
  const inSet = (v, set, tol) => set.some((s) => typeof s === 'number' && Math.abs(s - v) <= tol);
  const saturation = (c) => {
    const mx = Math.max(c.r, c.g, c.b);
    const mn = Math.min(c.r, c.g, c.b);
    return mx === 0 ? 0 : (mx - mn) / mx;
  };
  const selectorFor = (el) => {
    const out = [];
    let cur = el;
    while (cur && cur.tagName && out.length < 4) {
      let s = cur.tagName.toLowerCase();
      if (cur.id) s += `#${cur.id}`;
      else if (typeof cur.className === 'string' && cur.className) {
        const cls = cur.className.split(/\s+/).filter((c) => c && c.length < 22 && !/[[\]/]/.test(c)).slice(0, 2);
        if (cls.length) s += `.${cls.join('.')}`;
      }
      out.unshift(s);
      cur = cur.parentElement;
    }
    return out.join(' > ');
  };

  const bodyStack = getComputedStyle(document.body).fontFamily || '';
  const bodyFamily = bodyStack.split(',')[0].replace(/["']/g, '').trim().split(' ')[0];
  const monoFamilies = (contract.fontMono || '').split(',')
    .map((s) => s.replace(/["']/g, '').trim().split(' ')[0]).filter(Boolean);

  const CONTROL_TAGS = new Set(['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA']);
  const CONTROL_ROLES = new Set(['button', 'combobox', 'tab', 'switch', 'slider', 'spinbutton']);
  const heightTally = new Map();
  const radiusSeen = new Set();
  const all = document.querySelectorAll('body *');
  const limit = Math.min(all.length, 15000);

  for (let i = 0; i < limit; i++) {
    const el = all[i];
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) continue;

    const slots = [['color', cs.color], ['bg', cs.backgroundColor]];
    // outline-color defaults to currentColor, so sampling it unconditionally
    // would duplicate every text colour as a second finding.
    if (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) slots.push(['outline', cs.outlineColor]);
    if (parseFloat(cs.borderTopWidth)) slots.push(['border-t', cs.borderTopColor]);
    if (parseFloat(cs.borderRightWidth)) slots.push(['border-r', cs.borderRightColor]);
    if (parseFloat(cs.borderBottomWidth)) slots.push(['border-b', cs.borderBottomColor]);
    if (parseFloat(cs.borderLeftWidth)) slots.push(['border-l', cs.borderLeftColor]);
    for (const m of String(cs.backgroundImage || '').matchAll(/rgba?\([^)]+\)|#[0-9a-fA-F]{3,8}\b/g)) {
      slots.push(['gradient', m[0]]);
    }
    for (const [slot, raw] of slots) {
      const c = parse(raw);
      if (!onToken(c)) note('color_off_token', `${slot}:${show(c)}`, selectorFor(el));
    }

    for (const corner of ['TopLeft', 'TopRight', 'BottomRight', 'BottomLeft']) {
      const v = parseFloat(cs[`border${corner}Radius`]);
      if (Number.isFinite(v) && v > 0 && !inSet(v, contract.radius, 0.6)) {
        const key = `${Math.round(v)}px`;
        if (!radiusSeen.has(key)) {
          radiusSeen.add(key);
          note('radius_off_scale', key, selectorFor(el));
        }
      }
    }

    const isControl = CONTROL_TAGS.has(el.tagName) || CONTROL_ROLES.has((el.getAttribute('role') || '').toLowerCase());
    if (isControl) {
      const h = Math.round(rect.height);
      if (h > 1 && h <= 80 && !inSet(h, contract.heights, 1)) {
        heightTally.set(h, { count: (heightTally.get(h)?.count || 0) + 1, sample: selectorFor(el) });
      }
      if (viewportName === 'mobile' && (rect.width < 32 || rect.height < 32)) {
        note('touch_target_small', `${Math.round(rect.width)}x${Math.round(rect.height)}px`, selectorFor(el));
      }
      if (el.tagName === 'BUTTON' && !(el.textContent || '').trim()
        && !el.getAttribute('aria-label') && !el.getAttribute('title') && !el.getAttribute('aria-labelledby') && !el.id) {
        note('icon_button_no_accessible_name', '无文字且无 aria-label/title', selectorFor(el));
      }
    }

    const sizePx = parseFloat(cs.fontSize);
    if (Number.isFinite(sizePx) && !inSet(sizePx, contract.fontSizes, 0.6)) {
      note('font_size_off_scale', `${Math.round(sizePx * 100) / 100}px`, selectorFor(el));
    }
    if (cs.lineHeight !== 'normal') {
      const lh = parseFloat(cs.lineHeight);
      if (Number.isFinite(lh) && lh > 0 && !inSet(lh, contract.lineHeights, 1.2)) {
        note('line_height_off_scale', `${Math.round(lh)}px@${Math.round(sizePx)}px`, selectorFor(el));
      }
    }

    if (cs.position !== 'static' && cs.zIndex !== 'auto' && !contract.zIndex.includes(parseInt(cs.zIndex, 10))) {
      note('z_index_off_ladder', cs.zIndex, selectorFor(el));
    }

    if (cs.boxShadow && cs.boxShadow !== 'none') {
      const layers = cs.boxShadow.split(/,(?![^(]*\))/);
      for (const layer of layers) {
        const text = layer.replace(/\s+/g, ' ').trim();
        if (!text) continue;
        let color = null;
        const cm = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(text);
        if (cm) color = parse(cm[0]);
        // Chrome serialises an absent shadow as a fully transparent zero layer.
        if (!color || color.a <= 0.004) continue;
        const nums = (text.replace(/rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/gi, ' ').match(/-?[\d.]+(?:px|%)?/g) || [])
          .map(parseFloat).filter(Number.isFinite);
        const blur = nums.length >= 3 ? Math.abs(nums[2]) : 0;
        const dx = nums.length >= 1 ? Math.abs(nums[0]) : 0;
        const dy = nums.length >= 2 ? Math.abs(nums[1]) : 0;
        // Even a faint saturated halo is the "cheap glow" the spec bans, so its
        // alpha floor sits well below the neutral shadow floor.
        if (color.a >= 0.05 && saturation(color) > 0.28 && blur >= 12 && dx <= 2 && dy <= 2) {
          note('glow_neon_shadow', text.slice(0, 80), selectorFor(el));
        } else if (!normalizeShadowLocal(text, contract)) {
          note('shadow_off_contract', text.slice(0, 80), selectorFor(el));
        }
      }
    }

    const dur = cs.transitionDuration;
    if (dur && dur !== '0s') {
      for (const part of dur.split(',')) {
        const t = part.trim();
        const ms = t.endsWith('ms') ? parseFloat(t) : parseFloat(t) * 1000;
        if (Number.isFinite(ms) && ms > 0 && !inSet(ms, contract.durations, 6)) {
          note('motion_off_scale', `${Math.round(ms)}ms`, selectorFor(el));
        }
      }
    }

    const first = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim().split(' ')[0];
    if (first && bodyFamily && first !== bodyFamily && !monoFamilies.includes(first)) {
      note('font_family_off_stack', first, selectorFor(el));
    }

    if (/(auto|scroll|overlay)/.test(`${cs.overflowX} ${cs.overflowY}`)
      && el.scrollHeight > el.clientHeight + 2 && el.offsetWidth - el.clientWidth > 1) {
      note('native_scrollbar_visible', '纵向原生滚动条未隐藏', selectorFor(el));
    }
  }

  for (const [h, info] of heightTally) {
    note('control_height_off_contract', `${h}px`, info.sample, info.count);
  }

  const overflowX = document.documentElement.scrollWidth - document.documentElement.clientWidth;
  if (overflowX > 2) note('h_overflow', `溢出 ${overflowX}px`, 'documentElement');

  const focusables = [...document.querySelectorAll(
    'a[href], button:not([disabled]), input:not([type="hidden"]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])',
  )].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && !el.closest('[aria-hidden="true"]');
  }).slice(0, 14);
  for (const el of focusables) {
    const before = getComputedStyle(el);
    const beforeShadow = before.boxShadow;
    el.focus({ preventScroll: true });
    const after = getComputedStyle(el);
    const outlined = after.outlineStyle !== 'none' && parseFloat(after.outlineWidth) > 0;
    const ringed = after.boxShadow !== beforeShadow && after.boxShadow !== 'none';
    if (!outlined && !ringed) note('focus_indicator_missing', '聚焦后无 outline/box-shadow 变化', selectorFor(el));
    el.blur();
  }

  function normalizeShadowLocal(layer, c) {
    let text = layer.replace(/\s+/g, ' ').trim();
    const inset = /(^|\s)inset(\s|$)/.test(text);
    text = text.replace(/\binset\b/g, ' ');
    let color = 'none';
    const cm = /rgba?\([^)]*\)|#[0-9a-f]{3,8}\b/i.exec(text);
    if (cm) {
      const p = parse(cm[0]);
      if (p) color = show(p);
      text = text.replace(cm[0], ' ');
    }
    const nums = (text.match(/-?[\d.]+(?:px|%)?/g) || []).map(parseFloat).filter(Number.isFinite);
    while (nums.length < 4) nums.push(0);
    const sig = `${(inset ? 'i' : '') + nums.slice(0, 4).map((n) => Math.round(n * 1000) / 1000).join(' ')}|${color}`;
    return c.elevationLayers.includes(sig);
  }

  return { hits, nodesScanned: limit, focusablesSampled: focusables.length };
}

/* ------------------------------------------------------------------- audit */

async function auditRoutes(routes, contract, opts) {
  const origin = new URL(opts.baseUrl);
  const session = process.env.UI_AUDIT_KO_SESSION;
  if (routes.some((r) => r.tier === 'admin') && !session) {
    console.log('! 未设置 UI_AUDIT_KO_SESSION：/admin 只能检查到未登录跳转，后台页面本体本轮不纳入。');
  }

  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    locale: 'en-US',
    storageState: session
      ? {
        cookies: [{
          name: 'ko_session',
          value: session,
          domain: origin.hostname,
          path: '/',
          httpOnly: true,
          secure: origin.protocol === 'https:',
          sameSite: 'Lax',
        }],
        origins: [],
      }
      : { cookies: [], origins: [] },
  });

  const payload = {
    colors: contract.colors,
    radius: contract.radius,
    heights: contract.heights,
    fontSizes: contract.fontSizes,
    lineHeights: contract.lineHeights,
    zIndex: contract.zIndex,
    durations: contract.durations,
    elevationLayers: contract.elevationLayers,
    fontMono: contract.fontMono,
  };

  const results = [];
  let cursor = 0;
  const worker = async () => {
    const page = await context.newPage();
    page.on('dialog', (d) => d.dismiss().catch(() => {}));
    for (;;) {
      const route = routes[cursor++];
      if (!route) break;
      const entry = { ...route, viewports: {} };
      try {
        const resp = await page.goto(`${opts.baseUrl}${route.path === '/' ? '' : route.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: opts.timeoutMs,
        });
        entry.status = resp ? resp.status() : 0;
        const landed = new URL(page.url());
        entry.landedPath = landed.pathname.replace(/\/+$/, '') || '/';
        await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

        if (landed.hostname !== origin.hostname) {
          entry.unreachable = `route_redirected_offsite (${landed.hostname})`;
        } else if (entry.status >= 400) {
          entry.unreachable = `route_unreachable (HTTP ${entry.status})`;
        } else if (route.path.startsWith('/admin') && !entry.landedPath.startsWith('/admin')) {
          // The live deployment bounces an unauthenticated visitor to /studio,
          // so the admin surface is only auditable with a session cookie.
          entry.notice = 'admin_requires_session';
        } else {
          for (const vpName of opts.viewports) {
            await page.setViewportSize(vpName === 'mobile' ? { width: 390, height: 844 } : { width: 1440, height: 900 });
            await page.waitForTimeout(vpName === 'mobile' ? 450 : 300);
            try {
              entry.viewports[vpName] = await page.evaluate(samplePage, { contract: payload, viewportName: vpName });
            } catch (err) {
              entry.viewports[vpName] = { hits: [], error: String(err && err.message || err).slice(0, 160) };
            }
          }
        }
      } catch (err) {
        entry.unreachable = `route_unreachable (${String(err && err.message || err).slice(0, 70)})`;
      }
      results.push(entry);
      const diag = Object.entries(entry.viewports)
        .map(([k, v]) => `${k} ${v.nodesScanned ?? 0}节点/${v.focusablesSampled ?? 0}控件`)
        .join('，') || entry.unreachable || entry.notice || '未采样';
      process.stdout.write(`  采样 ${results.length}/${routes.length}  ${route.path}  → ${diag}\n`);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(opts.workers, routes.length)) }, worker));
  await context.close();
  await browser.close();
  return results;
}

/* --------------------------------------------------------------- findings */

function nearestToken(list, value) {
  return list.filter((n) => Number.isFinite(n))
    .reduce((a, b) => (Math.abs(b - value) < Math.abs(a - value) ? b : a), list[0]);
}

// An off-spec text colour should be answered with a text token, not with the
// mathematically nearest surface — white prose is --text-primary, not
// --bg-inverse, even though the latter is a few points closer.
const SLOT_TOKEN_PREFIX = {
  color: ['text-'],
  bg: ['bg-', 'background', 'card', 'popover', 'muted', 'input', 'secondary', 'scrim'],
  outline: ['accent-', 'border-accent', 'ring'],
  border: ['border-', 'accent-', 'success-', 'warning-', 'danger-', 'info-'],
  gradient: [],
};

function nearestTokenForSlot(value, contract) {
  const idx = value.indexOf(':');
  const slot = idx > 0 ? value.slice(0, idx) : '';
  const c = parseColor(idx > 0 ? value.slice(idx + 1) : value);
  if (!c) return '';
  const wanted = SLOT_TOKEN_PREFIX[slot.startsWith('border') ? 'border' : slot] ?? null;
  const pool = wanted && wanted.length ? contract.colors.filter((t) => wanted.some((p) => t.token.startsWith(p))) : contract.colors;
  const candidates = pool.length ? pool : contract.colors;
  let best = null;
  for (const t of candidates) {
    const d = (t.r - c.r) ** 2 + (t.g - c.g) ** 2 + (t.b - c.b) ** 2 + ((t.a - c.a) * 255) ** 2;
    if (!best || d < best.d) best = { d, token: t.token };
  }
  return best ? `改用 var(--${best.token})` : '';
}

function suggestion(rule, value, contract) {
  const num = parseFloat(value);
  switch (rule) {
    case 'radius_off_scale': {
      const n = nearestToken(contract.radius, num);
      const name = ['xs', 'sm', 'md', 'lg', 'xl', '2xl', 'full'][contract.radius.indexOf(n)];
      return `改用 var(--radius-${name || n}) (${n}px)`;
    }
    case 'control_height_off_contract':
      return `改用高度契约 ${nearestToken(contract.heights, num)}px`;
    case 'font_size_off_scale':
      return `改用字阶 ${nearestToken(contract.fontSizes, num)}px`;
    case 'motion_off_scale':
      return `改用 var(--motion-*) ${nearestToken(contract.durations, num)}ms`;
    case 'z_index_off_ladder':
      return `改用 var(--z-*) 阶梯（${contract.zIndex.join('/')}）`;
    case 'line_height_off_scale':
      return `改用配对的 var(--lh-*)`;
    case 'color_off_token':
      return nearestTokenForSlot(value, contract);
    case 'native_scrollbar_visible':
      return '加 scrollbar-none 及 ::-webkit-scrollbar: hidden';
    case 'focus_indicator_missing':
      return '加 focus-visible:ring-2 ring var(--accent-ring)';
    case 'icon_button_no_accessible_name':
      return '补 aria-label';
    case 'glow_neon_shadow':
      return '去掉彩色发光，改用 var(--elevation-*)';
    case 'shadow_off_contract':
      return '改用 var(--elevation-1..4)';
    default:
      return '';
  }
}

function collectFindings(auditResults, contract) {
  const bySig = new Map();
  const add = (rule, urlPath, value, sample = '', count = 1, where = '', requested = urlPath) => {
    const sig = crypto.createHash('sha1').update(`${rule}|${urlPath}|${value}`).digest('hex').slice(0, 10);
    const prev = bySig.get(sig);
    if (prev) {
      prev.count += count;
      if (!prev.sample && sample) prev.sample = sample;
      if (where && !prev.where.includes(where)) prev.where.push(where);
      if (!prev.servedFrom.includes(requested)) prev.servedFrom.push(requested);
      return;
    }
    bySig.set(sig, {
      sig,
      rule,
      url: urlPath,
      value,
      sample,
      count,
      where: where ? [where] : [],
      servedFrom: [requested],
      severity: RULES[rule]?.severity || 'P3',
      suggestion: suggestion(rule, value, contract),
    });
  };

  for (const entry of auditResults) {
    if (entry.notice) continue;
    const requested = stripLocale(entry.path);
    const landed = stripLocale(entry.landedPath || entry.path);
    // Findings belong to the page that actually rendered, otherwise a route
    // that silently redirects would blame the wrong address.
    if (landed !== requested) {
      add('route_landing_mismatch', requested, `请求 ${requested} → 实际渲染 ${landed}`, '', 1, 'route', requested);
    }
    const urlPath = landed;
    if (entry.unreachable) {
      const rule = entry.unreachable.startsWith('route_redirected') ? 'route_redirected_offsite' : 'route_unreachable';
      add(rule, urlPath, entry.unreachable, '', 1, 'route', requested);
      continue;
    }
    for (const [vpName, vp] of Object.entries(entry.viewports || {})) {
      if (vp.error) {
        add('sample_error', urlPath, vp.error, '', 1, vpName, requested);
        continue;
      }
      // The same value at two viewports is one finding, not two.
      for (const hit of vp.hits || []) {
        add(hit.rule, urlPath, hit.value, hit.sample, hit.count || 1, vpName, requested);
      }
    }
  }
  return bySig;
}

function stripLocale(p) {
  const first = p.split('/')[1];
  return LOCALE_ROOTS.includes(first) ? (p.slice(first.length + 1) || '/') : p;
}

/* --------------------------------------------------------------- baseline */

function loadState() {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (s && s.version === 1 && s.findings) return s;
  } catch { /* first run */ }
  return { version: 1, findings: {}, runs: [] };
}

function reconcile(state, current, at) {
  const fresh = [];
  const regressed = [];
  for (const [sig, f] of current) {
    const prev = state.findings[sig];
    if (!prev) {
      fresh.push(f);
      state.findings[sig] = { ...f, firstSeen: at, lastSeen: at, absentRuns: 0, seenCount: 1, status: 'open' };
    } else if (prev.status === 'resolved') {
      regressed.push({ ...f, firstSeen: prev.firstSeen });
      Object.assign(prev, f, { firstSeen: prev.firstSeen, lastSeen: at, absentRuns: 0, seenCount: (prev.seenCount || 1) + 1, status: 'open' });
    } else {
      Object.assign(prev, { lastSeen: at, absentRuns: 0, sample: prev.sample || f.sample });
    }
  }
  let resolved = 0;
  const seen = new Set(current.keys());
  for (const [sig, rec] of Object.entries(state.findings)) {
    if (rec.status !== 'open' || seen.has(sig)) continue;
    rec.absentRuns = (rec.absentRuns || 0) + 1;
    if (rec.absentRuns >= FIXED_AFTER_ABSENT_RUNS) {
      rec.status = 'resolved';
      resolved += 1;
    }
  }
  state.runs.push({ at, fresh: fresh.length, regressed: regressed.length, resolved, live: current.size });
  state.runs = state.runs.slice(-200);
  return { fresh, regressed, resolved };
}

/* ----------------------------------------------------------------- report */

function renderReport({ opts, at, listed, current, auditResults, isBaseline, freshCount, regressedCount, resolved, screenshots }) {
  const byUrl = new Map();
  for (const f of listed) {
    if (!byUrl.has(f.url)) byUrl.set(f.url, []);
    byUrl.get(f.url).push(f);
  }
  const skipped = auditResults.filter((r) => r.notice).map((r) => r.path);

  const lines = [];
  lines.push(`# 全站 UI 规范实机巡检 · ${at}`);
  lines.push('');
  lines.push(`- 目标 \`${opts.baseUrl}\`　视口 ${opts.viewports.join(' / ')}　覆盖 ${auditResults.length} 条路由`);
  lines.push('- 规范基准：`app/globals.css` token 区块（唯一真源）');
  lines.push(isBaseline
    ? `- **首轮**：登记现存 ${current.size} 项漂移作为基线。今后每小时只列新增与回潮。`
    : `- **本轮**：新增 ${freshCount} 项、回潮 ${regressedCount} 项；${resolved} 项连续缺席后判定已修复。现存基线 ${current.size} 项。`);
  if (skipped.length) {
    lines.push(`- ⚠️ ${skipped.length} 个 \`/admin\` 路由被重定向到登录页，后台页面未纳入本轮（在 \`.env.local\` 配 \`UI_AUDIT_KO_SESSION\` 后自动覆盖）。`);
  }
  lines.push('');

  if (!listed.length) {
    lines.push('## 本轮没有需要决策的条目');
    lines.push('');
    lines.push('线上渲染与既有基线一致，未出现新增或回潮的规范漂移。');
    lines.push('');
    return lines.join('\n');
  }

  lines.push(`## 待逐条确认（${listed.length} 项，按页面归组）`);
  lines.push('');
  const rank = (f) => SEVERITIES.indexOf(f.severity);
  const urls = [...byUrl.keys()].sort((a, b) => {
    const worst = (u) => Math.min(...byUrl.get(u).map(rank));
    return worst(a) - worst(b) || a.localeCompare(b);
  });
  for (const url of urls) {
    const items = byUrl.get(url).sort((a, b) => rank(a) - rank(b) || b.count - a.count);
    const counts = SEVERITIES.map((s) => items.filter((i) => i.severity === s).length);
    const served = [...new Set(items.flatMap((i) => i.servedFrom || []))].filter((s) => s !== url);
    lines.push(`### \`${url}\`　${counts.map((n, i) => (n ? `${SEVERITIES[i]}×${n}` : '')).filter(Boolean).join(' ')}`
      + (served.length ? `　（本页同时是 ${served.join(' / ')} 的实际落地页）` : ''));
    lines.push('');
    lines.push('| 编号 | 级别 | 规则 | 实测值 | 处数 · 视口 | 样例位置 | 建议 |');
    lines.push('| :-- | :-- | :-- | :-- | :-- | :-- | :-- |');
    for (const f of items.slice(0, 40)) {
      lines.push(`| \`${f.sig}\` | ${f.severity} | ${f.rule}<br>${RULES[f.rule]?.what || ''} | \`${cell(f.value)}\` | ×${f.count} · ${(f.where || []).join('+') || '—'} | ${cell(f.sample)} | ${cell(f.suggestion)} |`);
    }
    if (items.length > 40) lines.push(`| | | *（另 ${items.length - 40} 项，见同目录 findings.json）* | | | | |`);
    lines.push('');
    const pageShots = (screenshots || []).filter((p) => p.startsWith(safeName(url) + '-'));
    for (const s of pageShots) lines.push(`![${url} 截图](screenshots/${s})`);
    if (pageShots.length) lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('确认要处理某项时，回复它的编号即可定位到页面与元素。');
  return `${lines.join('\n')}\n`;
}

function cell(s) {
  return String(s == null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
function safeName(p) {
  return p.replace(/^\/+/, '').replace(/[^a-z0-9]+/gi, '-') || 'home';
}

/* -------------------------------------------------------------- artefacts */

async function captureScreenshots(auditResults, urls, opts, runDir) {
  if (!urls.size || !opts.screenshots) return [];
  const outDir = path.join(runDir, 'screenshots');
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  const written = [];
  for (const entry of auditResults) {
    if (written.length >= 24 || !urls.has(entry.path) || entry.unreachable) continue;
    const file = path.join(outDir, `${safeName(entry.path)}-desktop.png`);
    try {
      await page.goto(`${opts.baseUrl}${entry.path === '/' ? '' : entry.path}`, { waitUntil: 'domcontentloaded', timeout: opts.timeoutMs });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.screenshot({ path: file });
      written.push(path.basename(file));
    } catch { /* evidence is best-effort */ }
  }
  await context.close();
  await browser.close();
  return written;
}

function rotateRuns() {
  try {
    const runs = fs.readdirSync(RUNS_DIR).sort();
    for (const r of runs.slice(0, Math.max(0, runs.length - KEEP_RUNS))) {
      fs.rmSync(path.join(RUNS_DIR, r), { recursive: true, force: true });
    }
    // Screenshots dominate the footprint (~250KB each) and only matter while
    // the matching report is being triaged, so drop them past the last few runs.
    const remaining = fs.readdirSync(RUNS_DIR).sort().slice(0, -3);
    for (const r of remaining) {
      fs.rmSync(path.join(RUNS_DIR, r, 'screenshots'), { recursive: true, force: true });
    }
  } catch { /* rotation is best-effort */ }
}

const localStamp = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

/* -------------------------------------------------------------------- main */

async function main() {
  const opts = parseArgs(process.argv);
  loadSessionFromEnvFiles();
  const contract = loadContract();
  const all = routesFromApp(opts.tiers, opts.locales);
  const routes = opts.limit ? all.slice(0, opts.limit) : all;
  const started = new Date();
  const runDir = path.join(RUNS_DIR, started.toISOString().replace(/[:.]/g, '-'));
  fs.mkdirSync(runDir, { recursive: true });

  console.log(`UI 实机巡检 · ${opts.baseUrl} · ${routes.length} 条路由（全站 ${all.length}）`);
  console.log(`契约：token 色值 ${contract.colors.length} 个 · 圆角 ${contract.radius.length} 级 · 高度 ${contract.heights.join('/')}px\n`);

  const auditResults = await auditRoutes(routes, contract, opts);
  const current = collectFindings(auditResults, contract);
  const state = loadState();
  const isBaseline = Object.keys(state.findings).length === 0;
  const { fresh, regressed, resolved } = reconcile(state, current, started.toISOString());
  const listed = isBaseline ? [...current.values()] : [...fresh, ...regressed];

  const urlsForScreens = new Set(listed.filter((f) => !isBaseline || f.severity === 'P1').map((f) => f.url));
  const shots = await captureScreenshots(auditResults, urlsForScreens, opts, runDir);

  const at = localStamp(started);
  const report = renderReport({
    opts, at, listed, current, auditResults, isBaseline,
    freshCount: fresh.length, regressedCount: regressed.length, resolved, screenshots: shots,
  });
  fs.writeFileSync(path.join(runDir, 'report.md'), report);
  fs.writeFileSync(path.join(runDir, 'findings.json'), JSON.stringify([...current.values()], null, 2));
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  fs.writeFileSync(path.join(STATE_DIR, 'latest.md'), report);
  fs.writeFileSync(path.join(STATE_DIR, 'latest.json'), JSON.stringify({
    at,
    baseUrl: opts.baseUrl,
    isBaseline,
    routesChecked: auditResults.length,
    live: current.size,
    fresh,
    regressed,
    report: path.join(runDir, 'report.md'),
  }, null, 2));
  rotateRuns();

  console.log('='.repeat(72));
  console.log(`报告：${path.relative(ROOT, path.join(runDir, 'report.md'))}`);
  console.log(isBaseline
    ? `首轮基线：${current.size} 项现存漂移已登记，后续只报新增/回潮。`
    : `新增 ${fresh.length} · 回潮 ${regressed.length} · 判定已修复 ${resolved} · 现存基线 ${current.size}`);
  if (!isBaseline && !listed.length) {
    console.log('本轮无新增、无回潮，线上渲染与基线一致。');
    return;
  }
  const perUrl = new Map();
  for (const f of listed) {
    const cur = perUrl.get(f.url) || { total: 0, p1: 0 };
    cur.total += 1;
    if (f.severity === 'P1') cur.p1 += 1;
    perUrl.set(f.url, cur);
  }
  console.log('\n需要决策的页面（按 P1 数、项数排序）：');
  for (const [url, c] of [...perUrl.entries()].sort((a, b) => b[1].p1 - a[1].p1 || b[1].total - a[1].total).slice(0, 15)) {
    console.log(`  ${url.padEnd(36)} ${String(c.total).padStart(3)} 项，其中 P1 ${c.p1}`);
  }
}

function parseArgs(argv) {
  const opts = {
    baseUrl: (process.env.UI_AUDIT_BASE_URL || 'https://www.koyosim.com').replace(/\/$/, ''),
    tiers: ['front', 'studio', 'admin'],
    viewports: ['desktop', 'mobile'],
    locales: [],
    limit: 0,
    screenshots: true,
    timeoutMs: 15_000,
    workers: 2,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    const take = () => argv[++i];
    if (arg === '--tier') opts.tiers = take().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--viewport') opts.viewports = take().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--locale') opts.locales = take().split(',').map((s) => s.trim()).filter(Boolean);
    else if (arg === '--base-url') opts.baseUrl = take().replace(/\/$/, '');
    else if (arg === '--limit') opts.limit = Number(take());
    else if (arg === '--timeout') opts.timeoutMs = Number(take());
    else if (arg === '--workers') opts.workers = Number(take());
    else if (arg === '--no-screenshots') opts.screenshots = false;
    else if (arg === '--help' || arg === '-h') {
      const src = fs.readFileSync(new URL(import.meta.url), 'utf8');
      console.log(src.slice(0, src.indexOf('*/') + 2));
      process.exit(0);
    } else {
      console.error(`未知参数：${arg}`);
      process.exit(2);
    }
  }
  const bad = opts.viewports.filter((v) => !['desktop', 'mobile'].includes(v));
  if (bad.length) {
    console.error(`--viewport 只接受 desktop/mobile，收到 ${bad.join(',')}`);
    process.exit(2);
  }
  return opts;
}

main().catch((err) => {
  console.error('巡检失败：', err);
  process.exit(1);
});
