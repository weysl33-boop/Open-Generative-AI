import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const launchLocales = ['en', 'zh-CN', 'ja-JP', 'ko-KR', 'zh-TW', 'es'];
const locales = launchLocales;
const aliases = { zh: 'zh-CN', 'zh-CN': 'zh' };

function flatten(value, prefix = '', output = {}) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value)) flatten(child, prefix ? `${prefix}.${key}` : key, output);
  } else if (typeof value === 'string') {
    output[prefix] = value;
  }
  return output;
}

function placeholders(value) {
  return [...String(value || '').matchAll(/\{\{?\s*([\w.-]+)\s*\}?\}/g)].map((match) => match[1]).sort();
}

function same(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

async function readJson(filePath) {
  try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return null; }
}

async function readCatalog(locale) {
  const normalized = aliases[locale] || locale;
  const catalog = {};
  const common = await readJson(path.join(repoRoot, 'messages', normalized, 'common.json'));
  if (common) Object.assign(catalog, flatten({ common }));

  // 首屏之外的独立命名空间（404 页等）也吃同一套键数校验：新增一份而不补全 6 种语言，
  // 这里就该判红，而不是等到线上渲染出半英文的兜底页。
  const launchDir = path.join(repoRoot, 'messages', normalized);
  let launchEntries = [];
  try { launchEntries = await fs.readdir(launchDir, { withFileTypes: true }); } catch { return catalog; }
  for (const entry of launchEntries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const name = entry.name.replace(/\.json$/i, '');
    if (name === 'common') continue;
    const bundle = await readJson(path.join(launchDir, entry.name));
    if (bundle) Object.assign(catalog, flatten({ [name]: bundle }));
  }

  const studioDir = path.join(repoRoot, 'packages', 'studio', 'src', 'messages', normalized === 'zh-CN' ? 'zh' : normalized);
  let entries = [];
  try { entries = await fs.readdir(studioDir, { withFileTypes: true }); } catch { return catalog; }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const bundle = await readJson(path.join(studioDir, entry.name));
    if (bundle) Object.assign(catalog, flatten({ [`studio.${entry.name.replace(/\.json$/i, '')}`]: bundle }));
  }
  return catalog;
}

const catalogs = Object.fromEntries(await Promise.all(locales.map(async (locale) => [locale, await readCatalog(locale)])));
const base = catalogs.en;
const requiredBase = Object.fromEntries(Object.entries(base).filter(([, value]) => value.trim()));
const strict = process.argv.includes('--strict');
const issues = [];

for (const locale of locales) {
  const catalog = catalogs[locale];
  const missing = Object.keys(requiredBase).filter((key) => typeof catalog[key] !== 'string' || !catalog[key].trim());
  const extra = Object.keys(catalog).filter((key) => !Object.prototype.hasOwnProperty.call(base, key));
  const formatErrors = Object.keys(requiredBase).filter((key) => typeof catalog[key] === 'string' && !same(placeholders(requiredBase[key]), placeholders(catalog[key])));
  const fallback = locale === 'en' ? [] : Object.keys(requiredBase).filter((key) => catalog[key]?.trim() && catalog[key].trim() === requiredBase[key].trim());
  const total = Object.keys(requiredBase).length;
  const completed = locale === 'en' ? total : Object.keys(requiredBase).filter((key) => catalog[key]?.trim() && !fallback.includes(key) && !formatErrors.includes(key)).length;
  const coverage = total ? Number(((completed / total) * 100).toFixed(2)) : 100;
  console.log(`${locale}: ${completed}/${total} valid (${coverage.toFixed(2)}%), missing=${missing.length}, fallback=${fallback.length}, formatErrors=${formatErrors.length}, extra=${extra.length}`);
  if (missing.length) issues.push(`${locale}: missing ${missing.slice(0, 12).join(', ')}${missing.length > 12 ? ' ...' : ''}`);
  if (formatErrors.length) issues.push(`${locale}: placeholder mismatch ${formatErrors.slice(0, 12).join(', ')}${formatErrors.length > 12 ? ' ...' : ''}`);
  if (extra.length) issues.push(`${locale}: extra keys ${extra.slice(0, 12).join(', ')}${extra.length > 12 ? ' ...' : ''}`);
}

if (issues.length) {
  console.error('\nI18N validation findings:');
  for (const issue of issues) console.error(`- ${issue}`);
  if (strict) process.exitCode = 1;
} else {
  console.log('\nI18N structural validation passed.');
}
