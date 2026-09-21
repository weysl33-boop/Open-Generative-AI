/**
 * Static source census for docs/UI_AUDIT.md §1.
 *
 * §1 is the only table in the audit that is not produced by a gate, and until
 * now it was hand-counted — which is how it drifted (the same "396 inline
 * `<svg>`" survived two rounds of migration because nobody could re-derive
 * it). Every number in that table must come from this file or from
 * `ui-token-guard.mjs --report`; anything else is an opinion.
 *
 * Scope is deliberately wider than `audit-ui-source.mjs` (which sees only
 * app + components + studio): the audit's claim is "the whole repo ships four
 * visual systems", and that claim is falsified by the packages we do not scan.
 *
 *   node scripts/ui-source-census.mjs            # §1 table
 *   node scripts/ui-source-census.mjs --json     # machine-readable
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const DIRS = ['app', 'components', 'packages', 'lib', 'src'];
const SKIP = new Set(['node_modules', 'dist', 'coverage', 'test-results', '__snapshots__']);
const EXT = /\.(js|jsx)$/;

/**
 * Each measure states its own regex so a reviewer can disagree with the
 * methodology instead of the result. `svg` counts opening tags, not blocks: a
 * balanced `<svg>…</svg>` match treats a hand-drawn icon sheet as one defect,
 * and silently misses every self-closing element. `distinct` is meaningless
 * for it, hence `countOnly`.
 */
const MEASURES = {
  hex: { re: /#[0-9a-fA-F]{3,8}\b/g, label: '硬编码 HEX' },
  svg: { re: /<svg(?=[\s>/])/g, label: '手写内联 <svg>（开标签）', countOnly: true },
  px: {
    re: /(?:h|w|min-h|max-h|min-w|max-w|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|top|right|bottom|left|inset|basis|size)-\[\d+(?:\.\d+)?px\]/g,
    label: '任意像素类',
  },
  rounded: { re: /rounded(?:-[trblxy]?s?e?)?-\[[^\]]+\]/g, label: '任意圆角（rounded 系）' },
  z: { re: /z-\[\d+\]/g, label: '任意层级（z 系）' },
  shadow: { re: /shadow-\[[^\]]+\]/g, label: '任意阴影（shadow 系）' },
};

const files = [];
function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || SKIP.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (EXT.test(entry.name)) files.push(full);
  }
}
for (const d of DIRS) walk(path.join(ROOT, d));

const tally = {};
for (const key of Object.keys(MEASURES)) tally[key] = new Map();
let routes = 0;
let apiRoutes = 0;

for (const full of files) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  if (/(^|\/)page\.(js|jsx)$/.test(rel)) routes += 1;
  if (/(^|\/)route\.(js|jsx)$/.test(rel)) apiRoutes += 1;
  const src = fs.readFileSync(full, 'utf8');
  for (const [key, { re }] of Object.entries(MEASURES)) {
    for (const m of src.matchAll(re)) {
      const v = key === 'hex' ? m[0].toLowerCase() : m[0];
      tally[key].set(v, (tally[key].get(v) || 0) + 1);
    }
  }
}

const rows = Object.entries(MEASURES).map(([key, { label, countOnly }]) => {
  const map = tally[key];
  const total = [...map.values()].reduce((a, b) => a + b, 0);
  const top = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  return { key, label, distinct: countOnly ? null : map.size, total, top };
});

/**
 * PART 33 asks whether buttons / forms / dropdowns / modals are "unified", and
 * a primitive-consumer count alone cannot answer it: 73 files importing `Button`
 * says nothing about how many hand-written `<button>`s are still on screen. So
 * the census counts the raw elements too, excluding the UI layer itself — the
 * primitives are *allowed* to render `<button>`.
 */
const CONTROLS = {
  '<button': /<button(?=[\s>])/g,
  '<select': /<select(?=[\s>])/g,
  '<input': /<input(?=[\s>])/g,
  '<textarea': /<textarea(?=[\s>])/g,
};
const isUiLayer = (rel) => /(^|\/)ui\//.test(rel);
const controls = {};
for (const key of Object.keys(CONTROLS)) controls[key] = { total: 0, files: new Set() };
let businessFiles = 0;
for (const full of files) {
  const rel = path.relative(ROOT, full).replace(/\\/g, '/');
  if (isUiLayer(rel)) continue;
  businessFiles += 1;
  const src = fs.readFileSync(full, 'utf8');
  for (const [key, re] of Object.entries(CONTROLS)) {
    let n = 0;
    for (const _ of src.matchAll(re)) n += 1;
    if (!n) continue;
    controls[key].total += n;
    controls[key].files.add(rel);
  }
}
const controlRows = Object.entries(controls).map(([tag, v]) => ({ tag, total: v.total, files: v.files.size }));

if (process.argv.includes('--json')) {
  process.stdout.write(
    `${JSON.stringify({ files: files.length, routes, apiRoutes, rows, businessFiles, controlRows }, null, 2)}\n`,
  );
} else {
  console.log(`被扫描源文件: ${files.length}  (范围: ${DIRS.join(' ')} 的 .js/.jsx)`);
  console.log(`路由页面 / API 路由: ${routes} 个 page.js / ${apiRoutes} 个 route.js\n`);
  for (const r of rows) {
    const tops = r.top.map(([v, n]) => `${v} ×${n}`).join('、');
    const kinds = r.distinct === null ? '' : ` / ${String(r.distinct).padStart(4)} 种`;
    console.log(`${String(r.total).padStart(6)} 处${kinds}  ${r.label}`);
    console.log(`          top: ${tops}`);
  }
  console.log(`\n业务代码里的手写原生控件（已排除 UI 层自身，业务文件 ${businessFiles} 个）：`);
  for (const c of controlRows) {
    console.log(`${String(c.total).padStart(6)} 处 / ${String(c.files).padStart(4)} 个文件  ${c.tag}`);
  }
}
