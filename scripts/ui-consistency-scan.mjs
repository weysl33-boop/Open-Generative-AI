#!/usr/bin/env node
/**
 * UI consistency scanner: quantifies design-system drift across source.
 * Emits JSON to stdout for docs/UI_AUDIT.md evidence tables.
 */
import { readdirSync, statSync, readFileSync } from 'node:fs';
import { join, extname } from 'node:path';

const ROOT = process.cwd();
const SCOPES = [
  'app',
  'components',
  'packages/studio/src',
  'packages/Vibe-Workflow/packages/workflow-builder/src',
  'packages/Open-Poe-AI/packages/agents/src',
  'packages/Open-AI-Design-Agent/packages/design-agent/src',
];
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx']);
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'messages', '.git']);

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    let st;
    try {
      st = statSync(p);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(p, out);
    else if (EXTS.has(extname(e))) out.push(p);
  }
  return out;
}

const inc = (bag, key, file) => {
  bag.counts[key] = (bag.counts[key] || 0) + 1;
  const s = (bag.samples[key] ||= []);
  if (s.length < 12 && !s.includes(file)) s.push(file);
};

const PATTERNS = {
  hex_color: /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?!\/)/g,
  rgb_literal: /\brgba?\(\s*[\d.]+\s*,/g,
  arbitrary_px: /\b(?:-?m|p|g|gap|w|h|min-w|max-w|min-h|max-h|top|left|right|bottom|inset|size|leading|tracking)[a-z-]*-\[[\d.]+px\]/g,
  arbitrary_radius: /\brounded(?:-[a-z]+)?-\[[^\]]+\]/g,
  arbitrary_shadow: /\bshadow-\[[^\]]+\]/g,
  arbitrary_z: /\bz-\[\d{3,}\]/g,
  arbitrary_color_class: /\b(?:bg|text|border|from|to|via|ring|shadow)-\[[\d.]+(?:\/[\d.]+)?\]/g,
  transition_all: /\btransition-all\b/g,
  outline_none_bare: /\bfocus:outline-none\b(?!\s+\S*(?:ring|focus-visible))/g,
  inline_svg: /<svg\b/g,
  emoji_icon: /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu,
  tailwind_7plus: /\b(?:[a-z-]+:[a-z0-9-]+[\/\[\]#().\w-]*\s+){7,}[a-z-]+:[a-z0-9-]+/g,
};

// Height inventory: every distinct control height actually used
const HEIGHT_RE = /\bh-\[?(\d+)\]?/g;
// Font size inventory
const FONTSIZE_RE = /\btext-\[?(\d+)(?:px)?\]?\b|\btext-(xs|sm|base|lg|xl|2xl|3xl|4xl|5xl)\b/g;
const FONTSIZE_MAP = { xs: 12, sm: 14, base: 16, lg: 18, xl: 20, '2xl': 24, '3xl': 30, '4xl': 36, '5xl': 48 };
const RADIUS_RE = /\brounded-(none|sm|md|lg|xl|2xl|3xl|full)\b|\brounded-\[([^\]]+)\]/g;
const Z_RE = /\bz-(\d+|\[[\d]+\])/g;

const FONT_TAILWIND = { DEFAULT: 16 };
const WEIGHT_RE = /\bfont-(thin|light|normal|medium|semibold|bold|extrabold|black)\b/g;

const bag = { counts: {}, samples: {} };
const heights = {};
const fontsizes = {};
const radii = {};
const zs = {};
const weights = {};
const hexes = {};
const files = [];

for (const scope of SCOPES) {
  for (const abs of walk(join(ROOT, scope))) {
    const rel = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
    let src;
    try {
      src = readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    files.push(rel);
    for (const [name, re] of Object.entries(PATTERNS)) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        inc(bag, name, rel);
        if (name === 'hex_color') {
          const h = m[0].toLowerCase();
          hexes[h] = (hexes[h] || 0) + 1;
        }
      }
    }
    let m;
    HEIGHT_RE.lastIndex = 0;
    while ((m = HEIGHT_RE.exec(src))) {
      const k = `${m[1]}px`;
      heights[k] = (heights[k] || 0) + 1;
    }
    FONTSIZE_RE.lastIndex = 0;
    while ((m = FONTSIZE_RE.exec(src))) {
      const px = m[1] || FONTSIZE_MAP[m[2]] || FONT_TAILWIND[m[2]];
      if (px) fontsizes[`${px}px`] = (fontsizes[`${px}px`] || 0) + 1;
    }
    RADIUS_RE.lastIndex = 0;
    while ((m = RADIUS_RE.exec(src))) {
      const k = m[1] ? `rounded-${m[1]}` : `rounded-[${m[2]}]`;
      radii[k] = (radii[k] || 0) + 1;
    }
    Z_RE.lastIndex = 0;
    while ((m = Z_RE.exec(src))) zs[m[1]] = (zs[m[1]] || 0) + 1;
    WEIGHT_RE.lastIndex = 0;
    while ((m = WEIGHT_RE.exec(src))) weights[m[1]] = (weights[m[1]] || 0) + 1;
  }
}

const top = (obj, n = 30) =>
  Object.fromEntries(Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n));

const studioFiles = files.filter((f) => f.startsWith('packages/studio/src'));

console.log(
  JSON.stringify(
    {
      scanned_files: files.length,
      by_scope: {
        total: files.length,
        studio: studioFiles.length,
      },
      violation_counts: bag.counts,
      violation_samples: Object.fromEntries(
        Object.entries(bag.samples).map(([k, v]) => [k, v.slice(0, 8)]),
      ),
      height_distribution: top(heights, 40),
      fontsize_distribution: top(fontsizes, 40),
      radius_distribution: top(radii, 40),
      zindex_distribution: top(zs, 40),
      fontweight_distribution: top(weights, 20),
      top_hex_colors: top(hexes, 60),
      distinct_hex_count: Object.keys(hexes).length,
      distinct_height_count: Object.keys(heights).length,
      distinct_radius_count: Object.keys(radii).length,
    },
    null,
    2,
  ),
);
