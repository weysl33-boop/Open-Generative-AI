import 'server-only';

import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { DEFAULT_LOCALE, LOCALE_CONFIGS, normalizeLocale, SUPPORTED_LOCALES } from './locales.js';

const require = createRequire(import.meta.url);
const enCommon = require('../messages/en/common.json');
const zhCommon = require('../messages/zh/common.json');
const jaCommon = require('../messages/ja-JP/common.json');
const koCommon = require('../messages/ko-KR/common.json');
const zhTwCommon = require('../messages/zh-TW/common.json');
const esCommon = require('../messages/es/common.json');

export const I18N_SETTING_KEY = 'i18n.published';

const STUDIO_MESSAGES_ROOT = path.join(process.cwd(), 'packages', 'studio', 'src', 'messages');
const CATALOG_LOCALE_DIRS = { 'zh-CN': 'zh' };

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function flatten(value, prefix = '', output = {}) {
  if (!isPlainObject(value)) {
    if (typeof value === 'string') output[prefix] = value;
    return output;
  }
  for (const [key, child] of Object.entries(value)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, output);
  }
  return output;
}

function unflatten(entries) {
  const output = {};
  for (const [key, value] of Object.entries(entries || {})) {
    const parts = key.split('.');
    let current = output;
    for (const part of parts.slice(0, -1)) {
      if (!isPlainObject(current[part])) current[part] = {};
      current = current[part];
    }
    current[parts.at(-1)] = value;
  }
  return output;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function loadStudioBundles(locale) {
  const directory = path.join(STUDIO_MESSAGES_ROOT, CATALOG_LOCALE_DIRS[locale] || locale);
  const bundles = {};
  let entries = [];
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch {
    return bundles;
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue;
    const bundle = await readJson(path.join(directory, entry.name));
    if (bundle) bundles[`studio.${entry.name.replace(/\.json$/i, '')}`] = bundle;
  }
  return bundles;
}

const COMMON_BUNDLES = {
  en: enCommon,
  'zh-CN': zhCommon,
  'ja-JP': jaCommon,
  'ko-KR': koCommon,
  'zh-TW': zhTwCommon,
  es: esCommon,
};

export async function loadStaticCatalogs() {
  const catalogs = {};
  for (const locale of SUPPORTED_LOCALES) {
    const namespaces = {
      common: COMMON_BUNDLES[locale] || {},
      ...(await loadStudioBundles(locale)),
    };
    catalogs[locale] = flatten(namespaces);
  }
  return catalogs;
}

function extractPlaceholders(value) {
  return [...String(value || '').matchAll(/\{\{?\s*([\w.-]+)\s*\}?\}/g)]
    .map((match) => match[1])
    .sort();
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function validateCatalogs(catalogs, published = {}) {
  const base = catalogs[DEFAULT_LOCALE] || {};
  const result = {};
  for (const locale of SUPPORTED_LOCALES) {
    const requiredBase = Object.fromEntries(Object.entries(base).filter(([, value]) => String(value || '').trim()));
    const source = locale === DEFAULT_LOCALE ? base : { ...(catalogs[locale] || {}) };
    const overrides = published?.[locale] || {};
    const effective = { ...source, ...overrides };
    const fields = [];
    let completed = 0;
    for (const key of Object.keys(requiredBase).sort((a, b) => a.localeCompare(b, 'en'))) {
      const english = requiredBase[key];
      const raw = effective[key];
      const value = typeof raw === 'string' ? raw.trim() : '';
      const englishPlaceholders = extractPlaceholders(english);
      const valuePlaceholders = extractPlaceholders(value);
      const missing = locale !== DEFAULT_LOCALE && !value;
      const isFallback = locale !== DEFAULT_LOCALE && value && value === String(english).trim();
      const placeholderError = !sameValues(englishPlaceholders, valuePlaceholders);
      const status = locale === DEFAULT_LOCALE
        ? (value ? 'source' : 'invalid')
        : missing
          ? 'missing'
          : placeholderError
            ? 'format-error'
            : isFallback
              ? 'fallback'
              : 'translated';
      if (status === 'source' || status === 'translated') completed += 1;
      fields.push({
        key,
        english,
        value: raw ?? '',
        status,
        placeholders: englishPlaceholders,
        namespace: key.split('.')[0],
      });
    }
    const extraKeys = Object.keys(effective).filter((key) => !Object.prototype.hasOwnProperty.call(base, key));
    result[locale] = {
      locale,
      name: LOCALE_CONFIGS[locale]?.nativeName || locale,
      total: Object.keys(requiredBase).length,
      completed,
      missing: fields.filter((field) => field.status === 'missing').length,
      fallback: fields.filter((field) => field.status === 'fallback').length,
      formatErrors: fields.filter((field) => field.status === 'format-error').length,
      invalid: fields.filter((field) => field.status === 'invalid').length,
      extraKeys,
      coverage: Object.keys(requiredBase).length ? Number(((completed / Object.keys(requiredBase).length) * 100).toFixed(2)) : 100,
      fields,
    };
  }
  return result;
}

export function validateTranslationUpdate({ locale, key, value, catalogs }) {
  const normalizedLocale = normalizeLocale(locale);
  if (!SUPPORTED_LOCALES.includes(normalizedLocale)) return '不支持的语言 Locale';
  if (normalizedLocale === DEFAULT_LOCALE) return 'English 基准文案不可在此页面覆盖';
  if (!key || typeof key !== 'string' || !/^[a-z][a-z0-9_.-]+$/.test(key)) return 'translation key 格式无效';
  const base = catalogs[DEFAULT_LOCALE]?.[key];
  if (typeof base !== 'string') return 'translation key 不存在于 English 基准 catalog';
  if (typeof value !== 'string' || !value.trim()) return '翻译文案不能为空';
  if (!sameValues(extractPlaceholders(base), extractPlaceholders(value))) return '占位符必须与 English 基准文案完全一致';
  return null;
}

export function buildMessagesFromCatalog(catalog) {
  const namespaces = {};
  for (const [key, value] of Object.entries(catalog || {})) {
    const [namespace, ...rest] = key.split('.');
    if (!rest.length) continue;
    const nested = unflatten({ [rest.join('.')]: value });
    namespaces[namespace] = isPlainObject(namespaces[namespace])
      ? mergeNested(namespaces[namespace], nested)
      : nested;
  }
  return namespaces;
}

function mergeNested(base, override) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(override)) {
    merged[key] = isPlainObject(base[key]) && isPlainObject(value)
      ? mergeNested(base[key], value)
      : value;
  }
  return merged;
}

export function mergeCommonMessages(base, catalog) {
  const commonEntries = Object.fromEntries(
    Object.entries(catalog || {})
      .filter(([key]) => key.startsWith('common.'))
      .map(([key, value]) => [key.slice('common.'.length), value]),
  );
  return { ...base, ...unflatten(commonEntries) };
}
