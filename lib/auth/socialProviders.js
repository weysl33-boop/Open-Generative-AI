/**
 * Social login is split by geography, not by locale: a mainland visitor sees
 * 微信/QQ/抖音, everyone else sees Google/X/TikTok. Which channels are actually
 * offered inside each region is operator-managed (system_settings key
 * `social_login_display`), so this module stays pure — the caller resolves the
 * setting and the per-provider credential status and passes them in.
 */

export const SOCIAL_LOGIN_CATALOG = Object.freeze({
  mainland_china: Object.freeze(['wechat', 'qq', 'douyin']),
  international: Object.freeze(['google', 'x', 'tiktok']),
});

export const SOCIAL_LOGIN_REGIONS = Object.freeze(Object.keys(SOCIAL_LOGIN_CATALOG));

export const SOCIAL_LOGIN_SETTING_KEY = 'social_login_display';

function defaultRegionEntries(region) {
  return SOCIAL_LOGIN_CATALOG[region].map((id) => ({ id, enabled: true }));
}

function normalizeRegionEntries(region, rawEntries) {
  const allowed = SOCIAL_LOGIN_CATALOG[region];
  const seen = new Set();
  const entries = [];

  for (const raw of Array.isArray(rawEntries) ? rawEntries : []) {
    const id = typeof raw === 'string' ? raw : raw?.id;
    if (typeof id !== 'string' || !allowed.includes(id) || seen.has(id)) continue;
    seen.add(id);
    entries.push({ id, enabled: raw?.enabled !== false });
  }

  // A channel the operator never listed is still offered: dropping it silently
  // would take a working login button away from every visitor in that region.
  for (const id of allowed) {
    if (!seen.has(id)) entries.push({ id, enabled: true });
  }
  return entries;
}

/** Accepts whatever is in the settings row and always returns a full, safe map. */
export function sanitizeSocialLoginConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const config = {};
  for (const region of SOCIAL_LOGIN_REGIONS) {
    config[region] = normalizeRegionEntries(region, source[region] ?? source.enabled);
  }
  return config;
}

export function getDefaultSocialLoginConfig() {
  return Object.fromEntries(SOCIAL_LOGIN_REGIONS.map((region) => [region, defaultRegionEntries(region)]));
}

/**
 * @param region 'mainland_china' | 'international' | anything else yields no channels
 * @param {{ config?: object, configured?: Record<string, boolean> }} [options]
 *   configured=false hides a channel the operator left enabled, because the
 *   button would only fail after the visitor clicked it.
 */
export function getSocialLoginProviders(region, options = {}) {
  const catalog = SOCIAL_LOGIN_CATALOG[region];
  if (!catalog) return [];

  const config = sanitizeSocialLoginConfig(options.config);
  const configured = options.configured || {};
  return config[region]
    .filter((entry) => entry.enabled && configured[entry.id] !== false)
    .map((entry) => ({ id: entry.id, available: true }));
}
