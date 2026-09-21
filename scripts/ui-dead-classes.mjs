#!/usr/bin/env node
/**
 * Dead Tailwind class gate — the assertion for the defect class the other two
 * gates are structurally blind to.
 *
 * Tailwind silently drops a utility it does not recognise: `animate-fade-in-up`
 * (the plugin defining it was never registered), `shadow-2xl` (`boxShadow` is a
 * replacement in tailwind.config.js, so the default ramp no longer exists). The
 * build succeeds, the class string survives in source, the element renders with
 * no rule applied, and the pixel baseline records the broken state as correct.
 *
 * So: take the class tokens the source asks for and the class selectors the
 * compiled stylesheet emits, and diff them. Anything asked for but not emitted
 * is a class that does nothing.
 *
 * Both sides come from real artefacts rather than a hand-maintained vocabulary:
 *   source scope  = tailwind.config.js content globs, so adding a glob extends
 *                   this gate automatically
 *   token harvest = the guard's classStrings(), one definition of "class list"
 *   emitted set   = <dist>/static/css/*.css of a real production build
 *
 *   NEXT_DIST_DIR=.agents/verify-next npm run build
 *   node scripts/ui-dead-classes.mjs --dist .agents/verify-next [--report]
 *   node scripts/ui-dead-classes.mjs --dist .agents/verify-next --explain animate-fade-in-up
 *   node scripts/ui-dead-classes.mjs --dist .agents/verify-next --files 20
 *
 * Known limits, stated rather than papered over:
 *   - Tokens assembled at runtime (text-${x}-500) are skipped; guessing would
 *     turn the gate into noise. Interpolation spans are cut, so what survives is
 *     only the literal part of a template.
 *   - A string counts as a class list when it sits in className="…" or when the
 *     guard's heuristic already accepts it; tokens must be class-shaped, which
 *     is what keeps identifiers like `isSelected` out of the report.
 *   - A shared worktree changes faster than a build does, so occurrences in
 *     files newer than the dist are subtracted from the count, and a kind that
 *     appears only there is reported apart: a class the build never saw is not
 *     dead.
 *   - Styling another stylesheet owns needs a named entry in NOT_OURS.
 *   - `dark:` compiles to a descendant selector (.dark .x) and loses its
 *     prefix; that one shape is reconciled explicitly.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, dirname } from 'node:path';
import { classStrings, walk, ROOT, globToRe } from './ui-token-guard.mjs';

const require = createRequire(import.meta.url);

const config = createRequire(import.meta.url)('../tailwind.config.js');
const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : fallback;
};
const REPORT = args.includes('--report');
const LIMIT = Number(arg('--top', 30));
const BY_FILE = args.includes('--files') ? Number(arg('--files', 20)) || 20 : 0;
const ONLY = args.indexOf('--explain') >= 0 ? arg('--explain', '') : null;
const DIST = join(ROOT, arg('--dist', process.env.NEXT_DIST_DIR || '.next'));

/** Class shapes another stylesheet owns; each entry names its provider. */
const NOT_OURS = [
  ['^hljs', 'highlight.js theme CSS'],
  ['^(ProseMirror|ql-)', 'rich-text editor stylesheets'],
  ['^recharts-', 'chart library internals'],
  ['^swiper-', 'swiper module CSS'],
  ['^xterm-', 'terminal renderer CSS'],
  ['^rf-', 'react-flow theme'],
  ['^Toastify', 'toast library'],
];

const CONTENT = (config.content || []).map(globToRe);
const SCAN_ROOTS = Array.from(
  new Set((config.content || []).map((g) => g.replace(/^\.\//, '').split('/')[0])),
);

function relOf(path) {
  return relative(ROOT, path).replace(/\\/g, '/');
}

function sourceFiles() {
  const found = [];
  for (const dir of SCAN_ROOTS) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) continue;
    if (statSync(full).isFile()) found.push(full);
    else walk(full, found);
  }
  return Array.from(new Set(found)).filter((path) =>
    CONTENT.some((re) => re.test(relOf(path))),
  );
}

/**
 * A token only counts as a class when it is shaped like one: lowercased, and
 * carrying at least one `-` or `:` separator (or being a bare utility). This is
 * what keeps `const isSelected = …` and `"/onboarding"` out of the report — the
 * harvest reads source text, and source text is full of strings that are not
 * class names.
 */
const BARE_UTILITIES = new Set([
  'block', 'flex', 'grid', 'hidden', 'inline', 'italic', 'visible', 'truncate',
  'uppercase', 'lowercase', 'capitalize', 'antialiased', 'intrinsic', 'border',
  'outline', 'static', 'sticky', 'absolute', 'relative', 'fixed', 'contents',
  'nowrap', 'break', 'inherit', 'current', 'transparent',
]);

function classShaped(token) {
  if (/^(?:[a-z][a-z0-9]*-[\w.:/[\]%+-]+|[a-z][a-z0-9]*:[\w.:/[\]%+-]+)$/.test(token)) {
    return true;
  }
  return BARE_UTILITIES.has(token);
}

/** `${ … }` spans are JS, not classes; nesting is tracked so ternaries go too. */
function stripInterpolations(value) {
  if (!value.includes('${')) return value;
  let out = '';
  let depth = 0;
  for (let i = 0; i < value.length; i += 1) {
    if (value.startsWith('${', i)) {
      depth += 1;
      i += 1;
      continue;
    }
    if (depth) {
      if (value[i] === '{') depth += 1;
      else if (value[i] === '}') depth -= 1;
      continue;
    }
    out += value[i];
  }
  return out;
}

/** className="…" / class="…": a class list by position, even a single token. */
const CLASS_ATTR = /(?:className|class)\s*=\s*(["'])((?:[^"'\\\n]|\\.)*)\1/g;

/**
 * Stylesheets the app loads besides the compiled token sheet. A workspace
 * package ships its own tailwind.css and its components rely on it, so those
 * selectors are alive even though this build's CSS never heard of them.
 * Resolving them from the import graph beats the hand-maintained prefix list:
 * it answers "who owns this styling" from the code, and the list is only kept
 * for libraries whose CSS arrives through the bundler.
 */
const CSS_IMPORT = /(?:import|require)\s*\(?\s*['"]([^'"]+\.css)['"]/g;

function resolveSheet(from, spec) {
  const candidates = spec.startsWith('.')
    ? [resolve(dirname(from), spec)]
    : [join(ROOT, 'node_modules', spec), join(ROOT, spec)];
  try {
    candidates.unshift(require.resolve(spec, { paths: [dirname(from)] }));
  } catch {
    /* exports maps may refuse .css; the direct paths still cover the workspace case */
  }
  return candidates.find((c) => existsSync(c) && statSync(c).isFile()) || null;
}

function harvestable(token) {
  if (!token || token.length < 3) return false;
  if (/[$`{}()\\?&|=!,"]/.test(token)) return false;
  if (/^[0-9%.,-]+$/.test(token) || token.startsWith('!')) return false;
  return classShaped(token);
}

function sourceTokens(files, builtUntil, specs) {
  const rows = new Map();
  for (const path of files) {
    const src = readFileSync(path, 'utf8');
    const rel = relOf(path);
    const afterBuild = statSync(path).mtimeMs > builtUntil;
    for (const m of src.matchAll(CSS_IMPORT)) specs.push({ from: path, spec: m[1] });
    const lists = classStrings(src).map(stripInterpolations);
    // `className="…"` is harvested for its own sake (single-token lists are
    // invisible to the guard's heuristic), but the same text also arrives via
    // the generic string scan — count each literal once per file.
    const seen = new Set(lists);
    for (const m of src.matchAll(CLASS_ATTR)) {
      const value = stripInterpolations(m[2]);
      if (seen.has(value)) continue;
      seen.add(value);
      lists.push(value);
    }
    for (const value of lists) {
      // Split on whitespace only: a comma is legal inside an arbitrary value
      // (`transition-[background-color,border-color]` is one class).
      for (const token of value.split(/\s+/)) {
        if (!harvestable(token)) continue;
        let row = rows.get(token);
        if (!row) {
          row = { token, count: 0, files: new Map(), stale: new Set() };
          rows.set(token, row);
        }
        row.count += 1;
        row.files.set(rel, (row.files.get(rel) || 0) + 1);
        if (afterBuild) row.stale.add(rel);
      }
    }
  }
  return Array.from(rows.values()).sort(
    (a, b) => b.count - a.count || a.token.localeCompare(b.token),
  );
}

function cssFiles(dir) {
  const out = [];
  const stack = [join(dir, 'static', 'css')];
  while (stack.length) {
    const here = stack.pop();
    if (!existsSync(here)) continue;
    for (const entry of readdirSync(here)) {
      const full = join(here, entry);
      if (statSync(full).isDirectory()) stack.push(full);
      else if (entry.endsWith('.css')) out.push(full);
    }
  }
  return out;
}

/** Characters that cannot sit inside a class selector, escaped or not. */
const STOP = ' \t\r\n,{}()>+~:#!=["\'`&*/|';

function emittedClasses(css) {
  const set = new Set();
  let i = 0;
  while (i < css.length) {
    if (css[i] !== '.') {
      i += 1;
      continue;
    }
    let j = i + 1;
    let name = '';
    while (j < css.length) {
      const c = css[j];
      if (c === '\\') {
        const next = css[j + 1] || '';
        // `\20 ` style hex escapes end with a space; dropping both keeps the
        // name readable for the handful of classes that need them.
        if (next !== ' ') name += next;
        j += 2;
        continue;
      }
      if (STOP.includes(c)) break;
      name += c;
      j += 1;
    }
    if (name) set.add(name);
    i = Math.max(j, i + 1);
  }
  return set;
}

// ----------------------------------------------------------------------- main

function main() {
  if (!existsSync(join(DIST, 'static'))) {
    console.error(
      `ui-dead-classes: no build at ${relative(ROOT, DIST)}. Build one first:\n` +
        '  NEXT_DIST_DIR=<dir> npm run build   &&   node scripts/ui-dead-classes.mjs --dist <dir>',
    );
    return 1;
  }
  const sheets = cssFiles(DIST);
  if (!sheets.length) {
    console.error(`ui-dead-classes: no .css under ${relative(DIST, join(DIST, 'static', 'css'))}`);
    return 1;
  }
  let css = '';
  let builtUntil = 0;
  for (const sheet of sheets) {
    css += readFileSync(sheet, 'utf8');
    builtUntil = Math.max(builtUntil, statSync(sheet).mtimeMs);
  }
  const emitted = emittedClasses(css);
  const files = sourceFiles();
  const specs = [];
  const rows = sourceTokens(files, builtUntil, specs);

  const loaded = [];
  for (const { from, spec } of specs) {
    const sheet = resolveSheet(from, spec);
    if (!sheet) continue;
    if (loaded.some((s) => s.file === sheet)) continue;
    const selectors = emittedClasses(readFileSync(sheet, 'utf8'));
    for (const s of selectors) emitted.add(s);
    loaded.push({ file: sheet, spec, from: relOf(from), n: selectors.size });
  }

  const dead = [];
  const unbuild = [];
  for (const row of rows) {
    if (emitted.has(row.token)) continue;
    const { prefix, core } = row.token.includes(':')
      ? { prefix: row.token.slice(0, row.token.lastIndexOf(':') + 1), core: row.token.slice(row.token.lastIndexOf(':') + 1) }
      : { prefix: '', core: row.token };
    // `dark:` is the one variant that does not survive as a class name.
    if (prefix.endsWith('dark:') && emitted.has(core)) continue;
    if (NOT_OURS.some(([re]) => new RegExp(re).test(row.token))) continue;
    // Occurrences in files newer than the build prove nothing: the build never
    // saw them, so they cannot have been dropped.
    let unbuilt = 0;
    for (const f of row.stale) unbuilt += row.files.get(f) || 0;
    row.live = row.count - unbuilt;
    if (row.live <= 0) unbuild.push(row);
    else dead.push(row);
  }

  if (ONLY) {
    const row = rows.find((r) => r.token === ONLY);
    if (!row) {
      console.log(`${ONLY}: 源里没有这个类名（可能是动态拼接）`);
      return 0;
    }
    console.log(
      `${row.token}: ${row.count} 处 / ${row.files.size} 文件  ` +
        (emitted.has(row.token) ? '已生成' : '未生成 → 死类'),
    );
    for (const [f, n] of [...row.files].sort((a, b) => a[0].localeCompare(b[0]))) {
      console.log(`  ${String(n).padStart(3)}  ${f}${row.stale.has(f) ? '  (晚于本次构建)' : ''}`);
    }
    return 0;
  }

  const total = dead.reduce((n, r) => n + r.live, 0);
  console.log(
    `构建: ${relative(ROOT, DIST)}（${sheets.length} 份 css，${css.length} 字节，` +
      `生成 ${emitted.size} 个类选择器）\n` +
      `源: ${files.length} 个在 content 名单内的文件，取出 ${rows.length} 种类名\n`,
  );
  for (const s of loaded) {
    console.log(
      `另计样式表: ${relative(ROOT, s.file)}（${s.n} 个类，经 ${s.from} 的 "${s.spec}" 引入）`,
    );
  }
  console.log(`死类（源里有、产物里没有）: ${total} 处 / ${dead.length} 种`);

  if (BY_FILE) {
    const perFile = new Map();
    for (const r of dead) {
      for (const [f, n] of r.files) {
        if (r.stale.has(f)) continue;
        let row = perFile.get(f);
        if (!row) perFile.set(f, (row = { n: 0, kinds: new Set() }));
        row.n += n;
        row.kinds.add(r.token);
      }
    }
    const ranked = [...perFile].sort((a, b) => b[1].n - a[1].n || a[0].localeCompare(b[0]));
    let outside = 0;
    let outsideFiles = 0;
    for (const [f, row] of ranked.slice(BY_FILE)) {
      outside += row.n;
      outsideFiles += 1;
    }
    for (const [f, row] of ranked.slice(0, BY_FILE)) {
      console.log(`  ${String(row.n).padStart(4)}  ${f}  (${row.kinds.size} 种)`);
    }
    if (outsideFiles) console.log(`  … 另有 ${outsideFiles} 个文件共 ${outside} 处`);
    return REPORT ? 0 : fail();
  }

  for (const r of dead.slice(0, LIMIT)) {
    console.log(`  ${String(r.live).padStart(4)}  ${r.token}  (${r.files.size} 文件)`);
  }
  if (dead.length > LIMIT) console.log(`  … 另有 ${dead.length - LIMIT} 种，--top N 放宽`);
  if (unbuild.length) {
    console.log(
      `\n未参与本次构建（只出现在比产物更新的文件里，不计为死类）: ` +
        `${unbuild.reduce((n, r) => n + r.count, 0)} 处 / ${unbuild.length} 种`,
    );
    for (const r of unbuild.slice(0, 10)) {
      console.log(`  ${String(r.count).padStart(4)}  ${r.token}  (${[...r.stale].join(' ')})`);
    }
  }
  if (!dead.length) {
    console.log('\nui-dead-classes: pass. 源里请求的每个类都在产物里有对应规则。');
    return 0;
  }
  return REPORT ? 0 : fail();
}

function fail() {
  console.error(
    '\nui-dead-classes: 这些类不产生任何 CSS。要么换成在架令牌，要么把定义补进 ' +
      'globals.css / tailwind.config.js，不能留着当装饰。',
  );
  return 1;
}

process.exit(main());
