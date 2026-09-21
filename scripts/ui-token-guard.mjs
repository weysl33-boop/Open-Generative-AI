#!/usr/bin/env node
/**
 * UI token guard — the mechanical half of the design system.
 *
 * A written spec that nothing checks is a suggestion. This turns the
 * prohibitions in docs/UI_DESIGN_SYSTEM.md into a build gate: hard-coded
 * colours, arbitrary geometry, ad-hoc radius/shadow, invented z-index,
 * `transition-all` and stripped focus outlines in application source fail.
 *
 * The project is mid-migration, so it works as a ratchet, not a switch:
 * scripts/ui-token-baseline.json records how many violations each file still
 * has, and a file may only go down. `--update` re-records after an approved
 * migration step, so "we'll clean it up later" cannot silently become forever.
 *
 *   node scripts/ui-token-guard.mjs            # check (CI)
 *   node scripts/ui-token-guard.mjs --update   # re-baseline
 *   node scripts/ui-token-guard.mjs --report   # per-rule totals, always exits 0
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BASELINE = join(ROOT, 'scripts', 'ui-token-baseline.json');

const SKIP_DIRS = new Set([
  'node_modules', '.next', '.next-dev', '.next-prod', '.next-build', '.next-server',
  'dist', 'build', '.agents', '.git', 'coverage', 'release-staging', '.qoder', 'out',
  '.turbo', 'public',
]);

const SCAN_EXTENSIONS = new Set(['.js', '.jsx', '.mjs']);

/**
 * Documented exceptions (PART 06 allows rare ones, and "rare" must mean
 * named-and-reasoned rather than tolerated). An entry exempts one rule in one
 * file; the baseline ratchet no longer counts it, so the debt cannot grow.
 */
const EXCEPTIONS = {
  // A QR code must be dark-on-light to stay scannable; the surrounding surface
  // is part of the payload, not chrome.
  'components/ui/QRCodeSvg.js': ['pure-white-black'],
};

/** Bases owned by a more specific rule, so `other-arbitrary-value` stays quiet. */
const COUNTED_ELSEWHERE = new Set([
  'rounded', 'shadow', 'z', 'text', 'leading', 'tracking',
  'w', 'h', 'min-w', 'min-h', 'max-w', 'max-h', 'size', 'basis',
  'p', 'px', 'py', 'pt', 'pb', 'pl', 'pr',
  'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'gap',
  'inset', 'top', 'bottom', 'left', 'right', 'translate',
]);

/** Where literal values legitimately live: the token sheet and its mapping. */
const ALLOWED_FILES = new Set([
  'app/globals.css',
  'tailwind.config.js',
  'postcss.config.js',
  'scripts/ui-token-guard.mjs',
]);

/**
 * Brand artwork keeps its own colour — recorded as an explicit decision in
 * docs/UI_DESIGN_SYSTEM.md rather than left as an inconsistency.
 */
const BRAND_PATHS = [/^components\/brand\//, /^components\/(Logo|BrandLogo|Wordmark)/];

/**
 * A string literal counts as a class string when most of its tokens look like
 * Tailwind utilities. Keying off the content rather than the attribute syntax
 * means the guard cannot be evaded by hoisting a class list into a constant —
 * which is exactly how the previous "design system" hid 20 lines of hex values.
 */
const UTILITY =
  /^(?:[a-zA-Z0-9_[\]/.:-]+:)*(?:bg|text|border|rounded|ring|outline|shadow|z|inset|top|bottom|left|right|start|end|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|w|min-w|max-w|h|min-h|max-h|gap|space|flex|grid|items|justify|content|self|order|basis|grow|shrink|opacity|leading|tracking|font|antialiased|transition|duration|ease|delay|from|via|to|fill|stroke|divide|placeholder|backdrop|whitespace|break|truncate|cursor|select|pointer-events|resize|overflow|object|aspect|col|row|translate|scale|rotate|origin|will-change|sr|not)-/;
const CLASSISH = /(?:^|[\s,])(?:[a-zA-Z0-9_[\]/.:-]+:)?(?:bg|text|border|rounded|shadow|flex|grid|items|justify|w|h|p|m|gap|z|opacity|font|leading|transition)-[\w[.\]/-]/;

const STRING_LITERAL =
  /"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\)*(?:\$\{[^}]*\}[^`\\]*)*)`/g;

/**
 * `/alpha` on a colour the config registers as a bare `var(--x)`.
 *
 * Tailwind v3 alpha-modifies a colour by rebuilding it from its channels, and a
 * `var()` reference has no channels to rebuild — so `bg-primary/10` compiles to
 * nothing at all. The class stays in the source, the build stays silent, the
 * surface ships fully transparent, and the pixel baseline records the broken
 * state as correct. Every translucent variant therefore has to be a token of its
 * own, which is what tailwind.config.js says out loud above `success`.
 *
 * The name list is read from the configs rather than restated here, and it is
 * read per file: four packages ship their own tailwind.config.js, and
 * `Open-Poe-AI/packages/agents` registers `primary` as a literal hex, so
 * `bg-primary/10` genuinely compiles inside that package. A colour is only
 * forbidden where every config governing the file registers it as a var() —
 * which is what keeps this rule from accusing a file of a defect it does not
 * have. `scripts/ui-dead-classes.mjs` measures the same thing against a real
 * build; this rule is the part that needs no build to enforce.
 */
const ALPHA_BASES =
  'bg|text|border|underline|ring|fill|stroke|from|via|to|accent|caret|outline|divide|placeholder|shadow';

/** Glob → RegExp, shared with scripts/ui-dead-classes.mjs. */
function globToRe(glob) {
  const body = glob.replace(/^\.\//, '');
  let out = '';
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i];
    if (c === '*') {
      if (body[i + 1] === '*') {
        const slash = body[i + 2] === '/';
        out += slash ? '(?:.*/)?' : '.*';
        i += slash ? 2 : 1;
      } else {
        out += '[^/]*';
      }
      continue;
    }
    if (c === '{') {
      const end = body.indexOf('}', i);
      out += '(?:' + body.slice(i + 1, end).split(',').join('|') + ')';
      i = end;
      continue;
    }
    out += '.+^$()|[]\\'.includes(c) ? '\\' + c : c;
  }
  return new RegExp('^' + out + '$');
}

/** Registered colour names, and the subset that a var() value strands. */
function readColours(theme) {
  const names = new Set();
  const alphaless = new Set();
  const visit = (colors, prefix) => {
    for (const [key, value] of Object.entries(colors || {})) {
      const name = prefix && key !== 'DEFAULT' ? `${prefix}-${key}` : prefix || key;
      if (typeof value === 'string') {
        names.add(name);
        if (value.startsWith('var(') && !value.includes('<alpha-value>')) alphaless.add(name);
        continue;
      }
      if (value && typeof value === 'object') visit(value, name);
    }
  };
  visit(theme.colors, '');
  visit(theme.extend && theme.extend.colors, '');
  return { names, alphaless };
}

/** Each tailwind.config.js in the repo plus the file set its `content` claims. */
const TAILWIND_CONFIGS = walk(ROOT)
  .filter((path) => path.endsWith('tailwind.config.js'))
  .map((path) => {
    let config;
    try {
      config = createRequire(import.meta.url)(path);
    } catch {
      return null;
    }
    const dir = dirname(path);
    const theme = config.theme || {};
    const { names, alphaless } = readColours(theme);
    const sizes = { ...(theme.fontSize || {}), ...(theme.extend && theme.extend.fontSize) || {} };
    return {
      file: relative(ROOT, path).replace(/\\/g, '/'),
      dir,
      globs: (config.content || []).map((g) => globToRe(g.replace(/^\.\//, ''))),
      names,
      alphaless,
      // A config with a named type ramp is what makes `text-xs` a defect rather
      // than a choice: the alternative has to exist in the build this file
      // belongs to. Only the root config (and studio, which re-exports it) has
      // one; the vendored packages were written against the default scale.
      namedRamp: ['display', 'body', 'label', 'caption'].filter((k) => k in sizes).length >= 3,
    };
  })
  .filter((c) => c && c.globs.length);

/** The configs whose `content` claims this file. */
function governingConfigs(rel) {
  const abs = join(ROOT, rel);
  return TAILWIND_CONFIGS.filter((config) => {
    const scoped = relative(config.dir, abs).replace(/\\/g, '/');
    if (!scoped || scoped.startsWith('..')) return false;
    return config.globs.some((re) => re.test(scoped));
  });
}

const ALPHA_CACHE = new Map();

const DEFAULT_SIZE_RE = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b/g;

/**
 * `text-xs` is only a defect where a named type ramp exists to replace it — and
 * that is a property of the config compiling the file, not of the file itself.
 * The vendored workflow-builder and agents packages were written against the
 * default scale and have no ramp of their own; the root config (which is what
 * builds `/studio`) does, so its `content` list is this rule's jurisdiction.
 */
function typeRampRe(rel) {
  return governingConfigs(rel).some((config) => config.namedRamp) ? DEFAULT_SIZE_RE : /(?!)/g;
}

function alphalessRe(rel) {
  if (ALPHA_CACHE.has(rel)) return ALPHA_CACHE.get(rel);
  // A class works if *any* sheet that reaches this file defines it, so a name
  // is only dead here when every config claiming the file strands it.
  const forbidden = new Set();
  const alphaable = new Set();
  for (const config of governingConfigs(rel)) {
    for (const name of config.alphaless) forbidden.add(name);
    for (const name of config.names) if (!config.alphaless.has(name)) alphaable.add(name);
  }
  for (const name of alphaable) forbidden.delete(name);
  const names = [...forbidden];
  const re = names.length
    ? new RegExp(
        `\\b(?:${ALPHA_BASES})-(?:${names.sort((a, b) => b.length - a.length).join('|')})\\/\\d+\\b`,
        'g',
      )
    : /(?!)/g;
  ALPHA_CACHE.set(rel, re);
  return re;
}

const RULES = [
  {
    id: 'hard-coded-hex',
    re: /#[0-9a-fA-F]{3,8}\b/g,
    message: 'literal hex colour — call the semantic colour token',
  },
  {
    id: 'raw-color-function',
    re: /\b(?:rgb|rgba|hsl|hsla)\(/g,
    message: 'raw colour function — Tailwind v3 cannot alpha-modify a var(); add a token',
  },
  {
    id: 'alpha-on-var-colour',
    // File-dependent: which names are stranded depends on which config governs
    // the file, so `reFor` replaces `re` per scan (see scanFile and --explain).
    re: /(?!)/g,
    reFor: alphalessRe,
    message:
      'opacity on a var() colour — Tailwind emits no CSS for it; use a translucent token (bg-brand-soft, bg-wash)',
  },
  {
    id: 'ad-hoc-radius',
    re: /\brounded(?:-[a-z]+)?-\[[^\]]+\]/g,
    message: 'arbitrary radius — use rounded-xs..2xl',
  },
  {
    id: 'ad-hoc-shadow',
    re: /\bshadow(?:-[a-z0-9]+)?-\[[^\]]+\]/g,
    message: 'arbitrary shadow — use shadow-elevation-1..4',
  },
  {
    id: 'ad-hoc-z-index',
    re: /\bz-\[[^\]]+\]/g,
    message: 'arbitrary z-index — use the fixed ladder (z-base..z-tooltip)',
  },
  {
    id: 'arbitrary-geometry',
    re: /\b(?:w|h|min-w|min-h|max-w|max-h|size|basis|p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|inset|top|bottom|left|right|translate)-\[[^\]]+\]/g,
    message: 'arbitrary size/spacing — express it as a spacing or geometry token',
  },
  {
    id: 'arbitrary-type',
    re: /\b(?:text|leading|tracking)-\[[^\]]+\]/g,
    message: 'arbitrary font size/line height/tracking — use the type ramp',
  },
  {
    id: 'other-arbitrary-value',
    re: /\b([a-z][a-z0-9-]*)-\[([^\]]+)\]/g,
    message: 'arbitrary value — express it as a token',
    // `data-[…]` / `aria-[…]` are state selectors and `transition-[…]` is the
    // explicit property list the rule above *requires*; neither is a literal.
    // Bases owned by a more specific rule are skipped so nothing double-counts.
    allow: (base, body) =>
      base === 'data' ||
      base === 'aria' ||
      base === 'transition' ||
      COUNTED_ELSEWHERE.has(base) ||
      body.startsWith('&') ||
      !/^[-\d#.%]|px$|rem$|em$|vh$|vw$|^var\(|^calc\(|rgb|hsl/.test(body),
  },
  {
    id: 'transition-all',
    re: /\btransition-all\b/g,
    message: 'transition-all animates layout properties — name the property',
  },
  {
    id: 'outline-stripped',
    re: /\bfocus(?::visible)?:outline-none\b/g,
    message: 'focus outline removed — use FOCUS_RING',
  },
  {
    id: 'off-system-type-ramp',
    re: /(?!)/g,
    reFor: typeRampRe,
    message:
      'Tailwind default font size — it renders 12/14/16px and a line height the type ramp never approved; use text-display..text-micro',
  },
  {
    id: 'off-system-palette',
    re: /\b(?:bg|text|border|from|via|to|ring|fill|stroke|divide|placeholder|shadow|caret)-(?:gray|slate|zinc|neutral|stone|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|red|orange|amber|yellow|lime|green|emerald|teal)-\d{2,3}\b/g,
    message: 'raw Tailwind palette colour — use the semantic colour scale',
  },
  {
    id: 'pure-white-black',
    re: /\b(?:bg|text|border|from|via|to|ring|fill|stroke)-(?:white|black)(?:\/\d+)?\b/g,
    message: 'pure white/black surface — use the ink/surface ramp',
  },
];

/**
 * Source-level rules: the defect is the *absence* of a class, so these cannot
 * run over class strings. A bare `type="range"` is the case in point —
 * globals.css sets `appearance:none` on ranges, and without `.range` the
 * browser stops painting a thumb, so the control ships invisible and
 * undraggable. No class-string rule can see that.
 */
const RANGE_TOKEN = /(?:^|[\s"'`,{(=:])range(?:$|[\s"'`,})\]])/;

/**
 * The text of the JSX element containing `index`, from its `<` to the `>` that
 * actually closes it. A plain `indexOf('>')` ends on the `=>` of an inline
 * `onChange={(e) => …}`, which would hide every attribute written after the
 * handler — including the className the rule is looking for.
 */
function jsxTagAt(src, index) {
  const start = src.lastIndexOf('<', index);
  if (start < 0) return null;
  let depth = 0;
  let quote = null;
  for (let i = start; i < src.length; i += 1) {
    const c = src[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '{') depth += 1;
    else if (c === '}') depth -= 1;
    else if (c === '>' && depth === 0) return src.slice(start, i);
  }
  return null;
}

const SOURCE_RULES = [
  {
    id: 'range-without-utility',
    re: /type=(?:"|')range(?:"|')/g,
    message: 'native range input without the `.range` utility — invisible thumb (docs/UI_DESIGN_SYSTEM.md §4.5)',
    /**
     * Judged per element: strip the `type="range"` attribute itself, then look
     * for a standalone `range` token anywhere else in the tag. A class pulled
     * from a named constant will false-positive here — that is acceptable,
     * because the fix is to name the constant `range*` or inline the utility,
     * and both keep the invisible-thumb defect from shipping.
     */
    perMatch: (src, match, index) => {
      const tag = jsxTagAt(src, index);
      if (!tag) return false;
      return !RANGE_TOKEN.test(tag.replace(match[0], ''));
    },
  },
  {
    id: 'div-onclick-not-keyboard',
    re: /<div(?=[\s>])/g,
    message:
      'clickable <div> with no role/tabIndex/key handler — invisible to keyboard users (docs/UI_AUDIT.md §4.6)',
    /**
     * A `<div onClick>` is the one defect class no class-string rule can see:
     * the markup is perfectly on-palette and perfectly tokenised, and the
     * control simply does not exist for anyone who does not use a mouse. The
     * runtime audit only catches it if the element happens to be rendered and
     * focusable-enough to be sampled, so it is judged at source. Spread props
     * are not parsed, which means `<div {...rest}>` can false-negative here —
     * the ratchet still forbids adding a *new* one, and the fix is to use the
     * primitive instead of teaching this regex about every call site.
     */
    perMatch: (src, _match, index) => {
      const tag = jsxTagAt(src, index);
      if (!tag || !/\bonClick\s*[={(]/.test(tag)) return false;
      const semantic = /\brole\s*=|\btabIndex\s*=|\bonKeyDown\s*[={(]|\bonKeyUp\s*[={(]/.test(tag);
      const rendered = /\bas\s*=\s*[{|"'][^}|"']*(?:utton|ink)/.test(tag);
      // A backdrop that closes on click is deliberately not a control: the
      // keyboard path is the dialog's own Escape handling, and marking the
      // surface `aria-hidden` is how the design system says so out loud.
      const decorative = /aria-hidden\s*=\s*[{"']true/.test(tag);
      return !semantic && !rendered && !decorative;
    },
  },
];

function classStrings(src) {
  const out = [];
  for (const m of src.matchAll(STRING_LITERAL)) {
    const value = m[1] ?? m[2] ?? m[3];
    if (!value || value.length < 4) continue;
    const tokens = value.trim().split(/[\s,]+/).filter(Boolean);
    if (tokens.length < 2) continue;
    const utilityish = tokens.filter((t) => UTILITY.test(t)).length;
    if (utilityish / tokens.length < 0.5) continue;
    if (!CLASSISH.test(` ${value}`)) continue;
    out.push(value);
  }
  return out;
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith('.')) continue;
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (SCAN_EXTENSIONS.has(entry.slice(entry.lastIndexOf('.')))) out.push(full);
  }
  return out;
}

function countMatches(strings, rule) {
  let n = 0;
  for (const s of strings) {
    for (const m of s.matchAll(rule.re)) {
      if (rule.allow && rule.allow(m[1], m[2])) continue;
      n += 1;
    }
  }
  return n;
}

function scanFile(path, rel) {
  if (ALLOWED_FILES.has(rel)) return {};
  const src = readFileSync(path, 'utf8');
  const brand = BRAND_PATHS.some((re) => re.test(rel));
  const exempt = new Set(EXCEPTIONS[rel] || []);
  const hits = {};
  for (const rule of SOURCE_RULES) {
    if (brand || exempt.has(rule.id)) continue;
    let n = 0;
    for (const m of src.matchAll(rule.re)) if (rule.perMatch(src, m, m.index)) n += 1;
    if (n) hits[rule.id] = n;
  }
  const strings = classStrings(src);
  if (!strings.length) return hits;
  for (const rule of RULES) {
    if (brand || exempt.has(rule.id)) continue;
    const n = countMatches(strings, rule.reFor ? { ...rule, re: rule.reFor(rel) } : rule);
    if (n) hits[rule.id] = n;
  }
  return hits;
}

function main() {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));

  const files = walk(ROOT);
  const perFile = {};
  const perRule = {};
  let scanned = 0;
  for (const path of files) {
    const rel = relative(ROOT, path).replace(/\\/g, '/');
    scanned += 1;
    const hits = scanFile(path, rel);
    if (Object.keys(hits).length) {
      perFile[rel] = hits;
      for (const [rule, n] of Object.entries(hits)) perRule[rule] = (perRule[rule] || 0) + n;
    }
  }
  const total = Object.values(perRule).reduce((a, b) => a + b, 0);

  if (flags.has('--top')) {
    const limit = Number(args[args.indexOf('--top') + 1]) || 25;
    const rows = Object.entries(perFile)
      .map(([f, h]) => [f, Object.values(h).reduce((a, b) => a + b, 0)])
      .sort((a, b) => b[1] - a[1]);
    for (const [f, n] of rows.slice(0, limit)) console.log(`${String(n).padStart(5)}  ${f}`);
    console.log(`${Object.keys(perFile).length} of ${scanned} source files carry violations`);
    return 0;
  }

  // --explain <rule-id> [file]: print the offending class strings so a
  // reviewer can confirm a finding instead of trusting the count.
  const explainAt = args.indexOf('--explain');
  if (explainAt >= 0) {
    const ruleId = args[explainAt + 1];
    const only = args[explainAt + 2];
    const rule = [...RULES, ...SOURCE_RULES].find((r) => r.id === ruleId);
    if (!rule) {
      console.error(
        `unknown rule "${ruleId}". rules: ${[...RULES, ...SOURCE_RULES].map((r) => r.id).join(', ')}`,
      );
      return 1;
    }
    console.log(`# ${rule.id}: ${rule.message}\n`);
    const limit = Number(process.env.UI_EXPLAIN_LIMIT) || 25;
    let shown = 0;
    for (const path of files) {
      const rel = relative(ROOT, path).replace(/\\/g, '/');
      if (only && !rel.includes(only)) continue;
      if (ALLOWED_FILES.has(rel)) continue;
      if (rule.perMatch) {
        const src = readFileSync(path, 'utf8');
        for (const m of src.matchAll(rule.re)) {
          if (!rule.perMatch(src, m, m.index)) continue;
          const line = src.slice(0, m.index).split('\n').length;
          console.log(`${rel}:${line}\n    ${(jsxTagAt(src, m.index) || m[0]).replace(/\s+/g, ' ').slice(0, 160)}\n`);
          if (++shown >= limit) return 0;
        }
        continue;
      }
      const strings = classStrings(readFileSync(path, 'utf8'));
      const re = rule.reFor ? rule.reFor(rel) : rule.re;
      for (const s of strings) {
        for (const m of s.matchAll(re)) {
          if (rule.allow && rule.allow(m[1], m[2])) continue;
          console.log(`${rel}\n    ${m[0]}\n      in: ${s.replace(/\s+/g, ' ').slice(0, 150)}\n`);
          if (++shown >= limit) return 0;
        }
      }
    }
    if (!shown) console.log('(no matches)');
    return 0;
  }

  if (flags.has('--report')) {
    for (const [rule, n] of Object.entries(perRule).sort((a, b) => b[1] - a[1])) {
      console.log(`${String(n).padStart(6)}  ${rule}`);
    }
    console.log(`${String(total).padStart(6)}  TOTAL in ${Object.keys(perFile).length} of ${scanned} files`);
    return 0;
  }

  if (flags.has('--update')) {
    writeFileSync(BASELINE, `${JSON.stringify(perFile, null, 2)}\n`);
    console.log(`baseline written: ${total} violations across ${Object.keys(perFile).length} files (${scanned} scanned)`);
    return 0;
  }

  if (!existsSync(BASELINE)) {
    console.error('ui-token-guard: no baseline. Run `node scripts/ui-token-guard.mjs --update`.');
    return 1;
  }
  const baseline = JSON.parse(readFileSync(BASELINE, 'utf8'));
  const regressions = [];
  for (const [file, hits] of Object.entries(perFile)) {
    const allowed = baseline[file] || {};
    for (const [rule, n] of Object.entries(hits)) {
      if (n > (allowed[rule] || 0)) regressions.push(`${file}  ${rule}: ${allowed[rule] || 0} -> ${n}`);
    }
  }
  if (regressions.length) {
    console.error(`ui-token-guard: ${regressions.length} rule regression(s)\n`);
    for (const r of regressions.slice(0, 40)) console.error(`  ${r}`);
    if (regressions.length > 40) console.error(`  … and ${regressions.length - 40} more`);
    console.error('\nDocs: docs/UI_DESIGN_SYSTEM.md lists the token to use instead.');
    return 1;
  }
  const cleared = Object.keys(baseline).filter((f) => !perFile[f]).length;
  const reduced = Object.entries(perFile).filter(
    ([f, hits]) =>
      baseline[f] &&
      Object.values(baseline[f]).reduce((a, b) => a + b, 0) > Object.values(hits).reduce((a, b) => a + b, 0),
  ).length;
  console.log(
    `ui-token-guard: pass. ${total} legacy violation(s) in ${Object.keys(perFile).length} file(s); ` +
      `${cleared} cleared, ${reduced} reduced since baseline.`,
  );
  return 0;
}

/**
 * Exported for `scripts/ui-dead-classes.mjs`, which needs the same notion of
 * "which strings in this file are class lists" — forking that heuristic would
 * make the two gates disagree about what a class is.
 */
export {
  ROOT,
  SKIP_DIRS,
  SCAN_EXTENSIONS,
  classStrings,
  walk,
  scanFile,
  globToRe,
  RULES,
  SOURCE_RULES,
};

const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) process.exit(main());
