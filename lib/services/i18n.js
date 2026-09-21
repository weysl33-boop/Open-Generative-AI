import 'server-only';

import { logAudit } from '../admin/audit.js';
import { normalizeLocale } from '../locales.js';
import {
  I18N_SETTING_KEY,
  loadStaticCatalogs,
  validateCatalogs,
  validateTranslationUpdate,
} from '../i18nCatalog.js';
import * as settingsRepo from '../repositories/settings.js';

const DRAFT_SETTING_KEY = 'i18n.draft';
const MAX_CATALOG_BYTES = 2_000_000;

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function getSettingValue(key) {
  try {
    return asObject((await settingsRepo.getSettingByKey(key))?.value);
  } catch {
    return {};
  }
}

async function saveCatalog(key, value, actor) {
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_CATALOG_BYTES) {
    throw new Error('语言 catalog 超过 2 MB 上限');
  }
  return settingsRepo.updateSettingValue({
    key,
    value,
    updatedBy: actor?.email || 'system',
    visibility: 'public',
  });
}

export async function getPublishedCatalogOverrides() {
  return getSettingValue(I18N_SETTING_KEY);
}

export async function getLanguageManagementSnapshot() {
  const [catalogs, published, draft] = await Promise.all([
    loadStaticCatalogs(),
    getSettingValue(I18N_SETTING_KEY),
    getSettingValue(DRAFT_SETTING_KEY),
  ]);
  const mergedDraft = {};
  for (const locale of Object.keys(catalogs)) {
    mergedDraft[locale] = { ...(published[locale] || {}), ...(draft[locale] || {}) };
  }
  return {
    catalogs: validateCatalogs(catalogs, mergedDraft),
    locales: Object.values(validateCatalogs(catalogs, mergedDraft)).map(({ fields, ...summary }) => summary),
    draft: mergedDraft,
    published,
  };
}

export async function saveTranslation({ actor, locale, key, value, action = 'draft', requestId }) {
  const catalogs = await loadStaticCatalogs();
  const normalizedLocale = normalizeLocale(locale);
  const error = validateTranslationUpdate({ locale: normalizedLocale, key, value, catalogs });
  if (error) return { error };

  const [published, draft] = await Promise.all([
    getSettingValue(I18N_SETTING_KEY),
    getSettingValue(DRAFT_SETTING_KEY),
  ]);
  const nextDraft = {
    ...draft,
    [normalizedLocale]: { ...(draft[normalizedLocale] || {}), [key]: value },
  };
  const nextPublished = {
    ...published,
    [normalizedLocale]: {
      ...(published[normalizedLocale] || {}),
      ...(action === 'publish' ? nextDraft[normalizedLocale] : {}),
    },
  };

  const draftSetting = await saveCatalog(DRAFT_SETTING_KEY, nextDraft, actor);
  let publishedSetting = null;
  if (action === 'publish') {
    const validation = validateCatalogs(catalogs, nextPublished)[normalizedLocale];
    if (validation.missing || validation.formatErrors || validation.invalid) {
      return { error: '发布前仍存在缺失、格式错误或无效翻译，已保存草稿但未发布' };
    }
    publishedSetting = await saveCatalog(I18N_SETTING_KEY, nextPublished, actor);
  }

  await logAudit({
    actor,
    action: action === 'publish' ? 'i18n.publish' : 'i18n.draft.update',
    targetType: 'translation',
    targetId: `${normalizedLocale}:${key}`,
    riskLevel: action === 'publish' ? 'medium' : 'low',
    before: published?.[normalizedLocale]?.[key] || null,
    after: value,
    requestId,
  });
  return { draft: draftSetting, published: publishedSetting, locale: normalizedLocale, key };
}

export async function publishLocale({ actor, locale, requestId }) {
  const catalogs = await loadStaticCatalogs();
  const normalizedLocale = normalizeLocale(locale);
  const draft = await getSettingValue(DRAFT_SETTING_KEY);
  const candidate = { [normalizedLocale]: draft[normalizedLocale] || {} };
  const validation = validateCatalogs(catalogs, candidate)[normalizedLocale];
  if (validation.missing || validation.formatErrors || validation.invalid || validation.fallback) {
    return { error: '当前语言仍存在未翻译、fallback 或格式错误字段，不能发布' };
  }
  const published = await getSettingValue(I18N_SETTING_KEY);
  const nextPublished = {
    ...published,
    [normalizedLocale]: {
      ...(published[normalizedLocale] || {}),
      ...(draft[normalizedLocale] || {}),
    },
  };
  const setting = await saveCatalog(I18N_SETTING_KEY, nextPublished, actor);
  await logAudit({
    actor,
    action: 'i18n.locale.publish',
    targetType: 'locale',
    targetId: normalizedLocale,
    riskLevel: 'medium',
    after: { locale: normalizedLocale, coverage: validation.coverage },
    requestId,
  });
  return { setting, locale: normalizedLocale, coverage: validation.coverage };
}
